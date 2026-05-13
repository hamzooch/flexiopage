import mongoose, { Document, Schema } from 'mongoose';

/**
 * Five-tier permissions (descending):
 *   - 'owner'      : platform owner. Top of the hierarchy. Can do everything,
 *                    including creating/promoting admin and superadmin accounts.
 *                    Only an owner can grant the 'owner' role.
 *   - 'superadmin' : promotes/demotes between user/admin/superadmin (NOT owner),
 *                    tops up wallets, deletes users, manages complaints.
 *   - 'admin'      : platform operator. Sees the data, replies to complaints,
 *                    can adjust wallets but NOT change roles or fund
 *                    non-trivially.
 *   - 'supervisor' : read + moderation only. Can browse the admin dashboard
 *                    and reply to complaints, but CANNOT mutate users
 *                    (suspend / verify) or wallets (adjust / credit).
 *   - 'user'       : seller (default).
 */
export type UserRole = 'owner' | 'superadmin' | 'admin' | 'supervisor' | 'user';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  avatar?: string;
  emailVerified: boolean;
  /** When true, login is rejected. Set by an admin via /api/admin/users/:id. */
  suspended?: boolean;
  /** Optional reason shown when login is blocked. */
  suspendedReason?: string;
  suspendedAt?: Date;
  /**
   * Seller's country (ISO 3166-1 alpha-2, e.g. 'TN', 'DZ', 'FR'). Drives the
   * default wallet currency and is shown on the profile.
   */
  country?: string;
  /**
   * Seller's wallet currency (ISO 4217, e.g. 'TND', 'DZD', 'EUR'). Auto-derived
   * from `country` when the user updates their profile. Pinned once the wallet
   * has any transaction.
   */
  currency?: string;
  /** Tracked at successful login — handy for the admin user-detail screen. */
  lastLoginAt?: Date;
  lastLoginIp?: string;
  /**
   * Set when an admin forces a password reset. The user is told to log in
   * with the temporary password (returned once at reset time). We don't ask
   * them to change it on next login yet — that's a follow-up.
   */
  passwordResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['owner', 'superadmin', 'admin', 'supervisor', 'user'], default: 'user' },
    avatar: { type: String },
    emailVerified: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String },
    suspendedAt: { type: Date },
    country: { type: String, trim: true, uppercase: true, maxlength: 2 },
    currency: { type: String, trim: true, uppercase: true, maxlength: 3 },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    passwordResetAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
export const User = mongoose.model<IUser>('User', UserSchema);
