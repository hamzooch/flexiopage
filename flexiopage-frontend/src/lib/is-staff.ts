/**
 * Staff = the four platform roles that can enter /admin (owner, superadmin,
 * admin, supervisor) plus the platform founder, whose email is hardcoded so
 * access keeps working even if the role label is renamed in the DB.
 */
const STAFF_ROLES = new Set(['owner', 'superadmin', 'admin', 'supervisor']);
const FOUNDER_EMAIL = 'teyeb.hamza12@gmail.com';

export function isStaff(user: { role?: string; email?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.role && STAFF_ROLES.has(user.role)) return true;
  return user.email?.toLowerCase() === FOUNDER_EMAIL;
}
