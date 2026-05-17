'use client';

/**
 * Dashboard sidebar — desktop fixed rail + mobile drawer.
 *
 * Items are grouped into 3 sections (Workspace · Selling · Account) so the
 * nav doesn't read as one long list. Active state uses a left accent rail
 * and a subtle gradient pill, matching the rest of the dashboard chrome.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Store,
  Package,
  FileText,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  Sparkles,
  Plug,
  AppWindow,
  Wallet,
  UserRound,
  X,
  LifeBuoy,
  Image as ImageIcon,
  ShieldCheck,
  ArrowRight,
  UsersRound,
  LayoutTemplate,
  Layers,
  Activity,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, type TeamRole } from '@/stores/auth-store';
import { BrandLogo } from '@/components/brand-logo';
import { useT, type TKey } from '@/lib/i18n';

interface NavItem {
  href: string;
  /** Translation key — resolved at render time via `useT()`. */
  labelKey: TKey;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Which nav items a team member may see, by team role. Sellers (no teamRole)
 * see everything. Anything not listed here is hidden for that role — notably
 * "/dashboard/team" is seller-only, so it never appears for team members.
 */
const TEAM_ALLOWED: Record<TeamRole, string[]> = {
  confirmation_agent: [
    '/dashboard',
    '/dashboard/orders',
    '/dashboard/customers',
    '/dashboard/profile',
  ],
  manager: [
    '/dashboard',
    '/dashboard/analytics',
    '/dashboard/products',
    '/dashboard/offers',
    '/dashboard/pages',
    '/dashboard/pages/landing-image',
    '/dashboard/pages/poster',
    '/dashboard/orders',
    '/dashboard/tracking',
    '/dashboard/customers',
    '/dashboard/profile',
  ],
};

const SECTIONS: { titleKey: TKey; items: NavItem[] }[] = [
  {
    titleKey: 'sidebar.workspace',
    items: [
      { href: '/dashboard', labelKey: 'sidebar.overview', icon: LayoutDashboard },
      { href: '/dashboard/profile#stores', labelKey: 'sidebar.myStores', icon: Store },
      { href: '/dashboard/analytics', labelKey: 'sidebar.analytics', icon: BarChart3 },
    ],
  },
  {
    titleKey: 'sidebar.sales',
    items: [
      { href: '/dashboard/orders', labelKey: 'sidebar.orders', icon: ShoppingCart },
      { href: '/dashboard/products', labelKey: 'sidebar.products', icon: Package },
      { href: '/dashboard/offers', labelKey: 'sidebar.offers', icon: Layers },
      { href: '/dashboard/pages', labelKey: 'sidebar.landingPages', icon: FileText },
      { href: '/dashboard/pages/landing-image', labelKey: 'sidebar.aiLanding', icon: LayoutTemplate },
      { href: '/dashboard/pages/poster', labelKey: 'sidebar.aiPoster', icon: ImageIcon },
      { href: '/dashboard/tracking', labelKey: 'sidebar.tracking', icon: Activity },
      { href: '/dashboard/customers', labelKey: 'sidebar.customers', icon: Users },
      { href: '/dashboard/calculator', labelKey: 'sidebar.profitCalculator', icon: Calculator },
    ],
  },
  {
    titleKey: 'sidebar.account',
    items: [
      { href: '/dashboard/wallet', labelKey: 'sidebar.wallet', icon: Wallet },
      { href: '/dashboard/team', labelKey: 'sidebar.team', icon: UsersRound },
      { href: '/dashboard/support', labelKey: 'sidebar.support', icon: LifeBuoy },
      { href: '/dashboard/integrations', labelKey: 'sidebar.integrations', icon: Plug },
      { href: '/dashboard/apps', labelKey: 'sidebar.apps', icon: AppWindow },
      { href: '/dashboard/profile', labelKey: 'sidebar.profile', icon: UserRound },
      { href: '/dashboard/settings', labelKey: 'sidebar.settings', icon: Settings },
    ],
  },
];

interface Props {
  /** Mobile drawer state, controlled by Header's hamburger. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { t } = useT();
  const initials = (user?.name || user?.email || 'U')
    .split(/[\s@]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Staff (owner/superadmin/admin/supervisor) and the platform founder get a
  // shortcut button to the admin area. Email is kept alongside the role check
  // so the founder's account keeps access even if roles get renamed later.
  const FOUNDER_EMAIL = 'teyeb.hamza12@gmail.com';
  const STAFF_ROLES = new Set(['owner', 'superadmin', 'admin', 'supervisor']);
  const canAccessAdmin =
    STAFF_ROLES.has(String(user?.role || '')) ||
    user?.email?.toLowerCase() === FOUNDER_EMAIL;

  // Team members see a scoped sidebar based on their team role. Sellers
  // (no teamRole) see everything.
  const teamRole = user?.teamRole as TeamRole | undefined;
  const sections = teamRole
    ? SECTIONS
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => TEAM_ALLOWED[teamRole].includes(item.href)),
        }))
        .filter((section) => section.items.length > 0)
    : SECTIONS;

  // Close mobile drawer when navigating
  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onMobileClose}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300',
          'md:sticky md:top-0 md:z-30 md:h-screen md:w-64 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo + close (mobile) */}
        <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border/60 px-5 py-4">
          <Link
            href="/dashboard"
            className="flex items-center"
            aria-label="FlexioPage — tableau de bord"
          >
            <BrandLogo variant="color" width={130} priority />
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.titleKey}>
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {t(section.titleKey)}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground/70 hover:bg-sidebar-muted hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full gradient-brand" />
                        )}
                        <item.icon className="h-[17px] w-[17px] shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Admin shortcut (staff + founder only) */}
        {canAccessAdmin && (
          <div className="shrink-0 border-t border-sidebar-border/60 px-3 pt-3">
            <Link
              href="/admin"
              onClick={onMobileClose}
              className="group flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-rose-600 to-orange-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-rose-500/30 transition-transform hover:scale-[1.01]"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
              <span className="flex-1">Mode Admin Plateforme</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}

        {/* User card */}
        <div className="shrink-0 border-t border-sidebar-border/60 p-3">
          <Link
            href="/dashboard/profile"
            onClick={onMobileClose}
            className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-sidebar-muted"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-brand text-[11px] font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-foreground">
                {user?.name || 'User'}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {user?.email}
              </div>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
