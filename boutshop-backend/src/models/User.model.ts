import mongoose, { Document, Schema } from 'mongoose';

/**
 * Three-tier permissions:
 *   - 'superadmin' : owns the platform. Promotes/demotes admins, tops up
 *                    wallets, deletes users, manages complaints.
 *   - 'admin'      : platform operator. Sees the data, replies to complaints,
 *                    can adjust wallets but NOT change roles or fund
 *                    non-trivially.
 *   - 'user'       : seller (default).
 */
export type UserRole = 'superadmin' | 'admin' | 'user';

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
    role: { type: String, enum: ['superadmin', 'admin', 'user'], default: 'user' },
    avatar: { type: String },
    emailVerified: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String },
    suspendedAt: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    passwordResetAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
export const User = mongoose.model<IUser>('User', UserSchema);
