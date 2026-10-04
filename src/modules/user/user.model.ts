import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { PHONE_REGEX, USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from '../../consts/constants.js';

/**
 * One signed-in device. Refresh tokens are stored hashed, never in the clear,
 * so a database leak cannot be replayed as a login.
 */
export interface RefreshSession {
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string;
  ip: string;
}

export interface UserAttributes {
  name: string;
  /** Ten digit Indian mobile number, no country code - matches the storefront. */
  phone: string;
  phoneVerifiedAt?: Date;
  lastLoginAt?: Date;
  role: UserRole;
  status: UserStatus;
  sessions: RefreshSession[];
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<RefreshSession>(
  {
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { _id: false },
);

const userSchema = new Schema<UserAttributes>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    phone: {
      type: String,
      required: [true, 'WhatsApp number is required'],
      unique: true,
      index: true,
      trim: true,
      match: [PHONE_REGEX, 'Enter a valid 10-digit WhatsApp number starting with 6, 7, 8 or 9'],
    },
    phoneVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    sessions: { type: [sessionSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        // Never expose refresh-token hashes to a client.
        delete ret.sessions;
        return ret;
      },
    },
  },
);

export type UserDocument = HydratedDocument<UserAttributes>;
export type UserModelType = Model<UserAttributes>;

export const UserModel = model<UserAttributes>('User', userSchema);

/** Shape returned by the API in place of the raw document. */
export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  phoneVerifiedAt: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt ? user.phoneVerifiedAt.toISOString() : null,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
