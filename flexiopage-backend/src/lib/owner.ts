import type { IUser } from '../models/User.model';

/**
 * The id whose data a user operates on. For a seller it's their own id; for a
 * team member (an account with `parentUserId`) it's the seller who invited
 * them. Use this everywhere stores/orders are scoped to an "owner" so team
 * members transparently work inside the seller's account.
 */
export function effectiveOwnerId(user: Pick<IUser, '_id' | 'parentUserId'>): string {
  return (user.parentUserId || user._id).toString();
}

/** True when the user is a team member (invited by a seller), not a seller. */
export function isTeamMember(user: Pick<IUser, 'parentUserId'>): boolean {
  return !!user.parentUserId;
}
