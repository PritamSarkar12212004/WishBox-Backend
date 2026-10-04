import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { TOKEN_TYPES } from '../consts/constants.js';
import { UnauthorizedError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  role: string;
  type: typeof TOKEN_TYPES.ACCESS;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Unique id for this refresh token, so rotation can be traced. */
  jti: string;
  type: typeof TOKEN_TYPES.REFRESH;
}

const accessOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  issuer: env.JWT_ISSUER,
  audience: 'wishbox-api',
};

const refreshOptions: SignOptions = {
  expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  issuer: env.JWT_ISSUER,
  audience: 'wishbox-api',
};

export function signAccessToken(userId: string, phone: string, role: string): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    phone,
    role,
    type: TOKEN_TYPES.ACCESS,
  };
  return jwt.sign(payload, env.JWT_SECRET, accessOptions);
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    jti: randomUUID(),
    type: TOKEN_TYPES.REFRESH,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshOptions);
}

function decode(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: 'wishbox-api',
  });

  if (typeof decoded === 'string') {
    throw new UnauthorizedError('Invalid authentication token');
  }

  return decoded;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = decode(token, env.JWT_SECRET);

  if (payload.type !== TOKEN_TYPES.ACCESS || typeof payload.sub !== 'string') {
    throw new UnauthorizedError('Invalid authentication token');
  }

  return {
    sub: payload.sub,
    phone: String(payload.phone ?? ''),
    role: String(payload.role ?? 'customer'),
    type: TOKEN_TYPES.ACCESS,
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = decode(token, env.JWT_REFRESH_SECRET);

  if (
    payload.type !== TOKEN_TYPES.REFRESH ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  return { sub: payload.sub, jti: payload.jti, type: TOKEN_TYPES.REFRESH };
}

/**
 * Refresh tokens are long and random, so a fast hash is enough -
 * bcrypt is only needed for low-entropy secrets like OTP codes.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Seconds from an `expiresIn`-style duration string, for client hints. */
export function accessTokenTtlSeconds(): number {
  return parseDuration(env.JWT_EXPIRES_IN, 900);
}

export function parseDuration(value: string, fallback: number): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

  return amount * (multipliers[unit] ?? 1);
}
