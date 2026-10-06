import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { createChildLogger } from '../../config/logger.js';
import { sendOtpCode, sendSignupWelcome } from '../../services/whatsapp/index.js';
import { ERROR_CODES, HTTP_STATUS, OTP_LENGTH } from '../../consts/constants.js';
import { AppError, BadRequestError, ForbiddenError, UnauthorizedError } from '../../shared/errors.js';
import {
  accessTokenTtlSeconds,
  hashToken,
  parseDuration,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/tokens.js';
import { UserModel, toPublicUser, type PublicUser, type UserDocument } from '../user/user.model.js';
import { OtpModel } from './otp.model.js';

const log = createChildLogger('auth');

const BCRYPT_ROUNDS = 10;

/** Six independent random digits - never `Math.random()`. */
function generateCode(): string {
  let code = '';
  for (let index = 0; index < OTP_LENGTH; index += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

export interface RequestOtpResult {
  phone: string;
  /** The gateway delivers over WhatsApp only. */
  channel: 'whatsapp';
  expiresInSeconds: number;
  resendAfterSeconds: number;
  isNewUser: boolean;
  /** Only present in development when OTP_DEBUG_RETURN_CODE is on. */
  devCode?: string;
}

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

// ---------------------------------------------------------------------------
// Step 1 - request a code
// ---------------------------------------------------------------------------
export async function requestOtp(phone: string): Promise<RequestOtpResult> {
  const now = new Date();
  const existing = await OtpModel.findOne({ phone });

  // Throttle resends: the storefront shows the same 30 second countdown.
  if (existing && !existing.consumedAt && existing.expiresAt > now) {
    const elapsedSeconds = (now.getTime() - existing.lastSentAt.getTime()) / 1000;
    const retryAfterSeconds = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);

    if (retryAfterSeconds > 0) {
      throw new AppError(
        `Please wait ${retryAfterSeconds}s before requesting another code`,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_COOLDOWN,
        { details: { retryAfterSeconds }, isOperational: true },
      );
    }
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000);

  await OtpModel.findOneAndUpdate(
    { phone },
    {
      $set: { codeHash, attempts: 0, expiresAt, lastSentAt: now },
      $unset: { consumedAt: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  try {
    await sendOtpCode(phone, code);
  } catch (error) {
    // No code reached the shopper, so do not make them wait for the cooldown.
    await OtpModel.deleteOne({ phone, codeHash }).catch(() => undefined);
    throw error;
  }

  const isNewUser = (await UserModel.exists({ phone })) === null;
  log.info({ phone, isNewUser }, 'OTP requested');

  const result: RequestOtpResult = {
    phone,
    channel: 'whatsapp',
    expiresInSeconds: env.OTP_TTL_SECONDS,
    resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    isNewUser,
  };

  if (env.EXPOSE_OTP_IN_RESPONSE) {
    result.devCode = code;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2 - verify the code, then find or create the shopper
// ---------------------------------------------------------------------------
interface ShopperLookup {
  user: UserDocument;
  /** True only when this call created the account. */
  isNewUser: boolean;
}

async function findOrCreateUser(phone: string, name?: string): Promise<ShopperLookup> {
  const now = new Date();
  const existing = await UserModel.findOne({ phone });

  if (existing) {
    if (existing.status === 'blocked') {
      throw new ForbiddenError('This account has been blocked');
    }

    // The storefront asks for the name on every sign-in, so a corrected name
    // is honoured. Leaving it blank keeps whatever is on file.
    if (name && name !== existing.name) {
      existing.name = name;
    }
    existing.phoneVerifiedAt = now;
    existing.lastLoginAt = now;
    await existing.save();
    return { user: existing, isNewUser: false };
  }

  if (!name) {
    throw new BadRequestError('Your name is required to create an account');
  }

  const created = await UserModel.create({
    name,
    phone,
    phoneVerifiedAt: now,
    lastLoginAt: now,
  });

  return { user: created, isNewUser: true };
}

async function issueSession(user: UserDocument, context: RequestContext): Promise<AuthSession> {
  const accessToken = signAccessToken(user.id, user.phone, user.role);
  const refreshToken = signRefreshToken(user.id);
  const now = new Date();

  const refreshTtl = parseDuration(env.JWT_REFRESH_EXPIRES_IN, 30 * 86_400);
  const sessions = [
    ...user.sessions.filter((session) => session.expiresAt > now),
    {
      tokenHash: hashToken(refreshToken),
      createdAt: now,
      expiresAt: new Date(now.getTime() + refreshTtl * 1000),
      userAgent: context.userAgent ?? '',
      ip: context.ip ?? '',
    },
  ].slice(-env.AUTH_MAX_SESSIONS);

  user.set('sessions', sessions);
  await user.save();

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
    expiresInSeconds: accessTokenTtlSeconds(),
  };
}

export async function verifyOtp(
  phone: string,
  code: string,
  name: string | undefined,
  context: RequestContext,
): Promise<AuthSession> {
  const now = new Date();
  const challenge = await OtpModel.findOne({ phone });

  if (!challenge || challenge.expiresAt <= now) {
    throw new AppError(
      'This code has expired, please request a new one',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.OTP_EXPIRED,
      { isOperational: true },
    );
  }

  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) {
    await OtpModel.deleteOne({ _id: challenge._id });
    throw new AppError(
      'Too many incorrect attempts, please request a new code',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
      { isOperational: true },
    );
  }

  const matches = await bcrypt.compare(code, challenge.codeHash);

  if (!matches) {
    const updated = await OtpModel.findByIdAndUpdate(
      challenge._id,
      { $inc: { attempts: 1 } },
      { new: true },
    );
    const attemptsRemaining = Math.max(
      0,
      env.OTP_MAX_ATTEMPTS - (updated?.attempts ?? challenge.attempts + 1),
    );

    throw new AppError(
      attemptsRemaining > 0
        ? `That code is not correct. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} left.`
        : 'That code is not correct, please request a new one',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.OTP_INVALID,
      { details: { attemptsRemaining }, isOperational: true },
    );
  }

  // Atomic single use: whichever request deletes the challenge wins, so the
  // same code can never mint two sessions.
  const consumed = await OtpModel.deleteOne({ _id: challenge._id });
  if (consumed.deletedCount === 0) {
    throw new AppError(
      'This code has already been used, please request a new one',
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.OTP_EXPIRED,
      { isOperational: true },
    );
  }

  const { user, isNewUser } = await findOrCreateUser(phone, name);
  const session = await issueSession(user, context);

  // Sent on *every* successful verify, for a returning shopper as well as a
  // brand-new one - that is the agreed product behavior for this template.
  //
  // Deliberately not awaited: the session is already issued, so a slow or dead
  // gateway must never delay or fail the sign-in. `sendSignupWelcome` never
  // throws on a delivery failure; the catch only guards the promise itself.
  void sendSignupWelcome(phone).catch((error: unknown) => {
    log.error(
      { phone, message: error instanceof Error ? error.message : String(error) },
      'Welcome message could not be sent',
    );
  });

  log.info({ userId: user.id, phone, isNewUser }, 'Shopper signed in');
  return session;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export async function refreshSession(
  refreshToken: string,
  context: RequestContext,
): Promise<AuthSession> {
  const payload = verifyRefreshToken(refreshToken);

  const user = await UserModel.findById(payload.sub);
  if (!user) {
    throw new UnauthorizedError('Your session is no longer valid, please sign in again');
  }
  if (user.status === 'blocked') {
    throw new ForbiddenError('This account has been blocked');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = user.sessions.find((session) => session.tokenHash === tokenHash);

  if (!stored) {
    throw new UnauthorizedError('This session was signed out, please sign in again');
  }

  // Rotate: the presented token is retired as soon as it is used.
  const now = new Date();
  user.set(
    'sessions',
    user.sessions.filter((session) => session.tokenHash !== tokenHash && session.expiresAt > now),
  );

  return issueSession(user, context);
}

export async function logout(
  userId: string,
  refreshToken: string | undefined,
  allDevices: boolean,
): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) return;

  if (allDevices || !refreshToken) {
    user.set('sessions', []);
  } else {
    const tokenHash = hashToken(refreshToken);
    user.set(
      'sessions',
      user.sessions.filter((session) => session.tokenHash !== tokenHash),
    );
  }

  await user.save();
}
