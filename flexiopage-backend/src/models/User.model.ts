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

/**
 * Seller-team roles. A team member is a `role: 'user'` account whose
 * `parentUserId` points at the seller who invited them. They operate inside
 * that seller's account (stores, orders) with a scoped view of the dashboard:
 *   - 'manager'            : broad access — products, orders, customers, pages.
 *   - 'confirmation_agent' : calls customers to confirm COD orders; sees and
 *                            updates orders only.
 */
export type TeamRole = 'manager' | 'confirmation_agent';

export interface IUser extends Document {
  email: string;
  /**
   * Bcrypt hash. Optional because Google-only users never set a local
   * password — they authenticate via the Google OAuth ID-token endpoint.
   * When undefined, email+password login must reject with a clear "use
   * Google sign-in" message.
   */
  password?: string;
  /**
   * Google account id (sub claim from the verified ID token). Sparse
   * unique — set once per Google account, linked on first sign-in. An
   * existing email+password user signing in with a Google account whose
   * email matches gets linked rather than duplicated.
   */
  googleId?: string;
  name: string;
  role: UserRole;
  /**
   * When set, this account is a team member of the seller with this id.
   * Their effective "owner" for store/order scoping is `parentUserId`.
   */
  parentUserId?: mongoose.Types.ObjectId;
  /** Role within the parent seller's team. Only meaningful when parentUserId is set. */
  teamRole?: TeamRole;
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
    password: { type: String, select: false },  // optional — Google-only users have no local password
    googleId: { type: String, index: { unique: true, sparse: true } },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['owner', 'superadmin', 'admin', 'supervisor', 'user'], default: 'user' },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    teamRole: { type: String, enum: ['manager', 'confirmation_agent'] },
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
