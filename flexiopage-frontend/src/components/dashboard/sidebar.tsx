'use client';

/**
 * Dashboard sidebar — desktop fixed rail + mobile drawer.
 *
 * Items are grouped into 3 sections (Workspace · Selling · Account) so the
 * nav doesn't read as one long list. Active state uses a left accent rail
 * and a subtle gradient pill, matching the rest of the dashboard chrome.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  ShieldCheck,
  ArrowRight,
  UsersRound,
  Layers,
  Activity,
  Calculator,
  Wand2,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, type TeamRole } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { BrandLogo } from '@/components/brand-logo';
import { useT, type TKey } from '@/lib/i18n';
import { useInstalledApps } from '@/lib/installed-apps';

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
      { href: '/dashboard/stores', labelKey: 'sidebar.myStores', icon: Store },
      { href: '/dashboard/analytics', labelKey: 'sidebar.analytics', icon: BarChart3 },
    ],
  },
  {
    titleKey: 'sidebar.sales',
    items: [
      { href: '/dashboard/orders', labelKey: 'sidebar.orders', icon: ShoppingCart },
      { href: '/dashboard/products', labelKey: 'sidebar.products', icon: Package },
      { href: '/dashboard/suppliers', labelKey: 'sidebar.suppliers', icon: Building2 },
      { href: '/dashboard/offers', labelKey: 'sidebar.offers', icon: Layers },
      { href: '/dashboard/pages', labelKey: 'sidebar.landingPages', icon: FileText },
      { href: '/dashboard/pages/poster', labelKey: 'sidebar.aiStudio', icon: Wand2 },
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
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get('tab') ?? null;
  const user = useAuthStore((s) => s.user);
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const { t } = useT();
  // Apps installées pour la boutique active — affichées comme sous-items
  // sous l'entrée principale "Applications" (logos en mini gradient).
  const installedApps = useInstalledApps(currentStoreId);

  // Zustand persist s'hydrate APRÈS le premier rendu client. Pendant ce
  // bref instant `user` est null et la carte vendeur en bas du sidebar
  // affichait un générique « Utilisateur ». On attend l'hydratation pour
  // afficher la vraie valeur (cf même pattern dans Header).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const apply = () => setHydrated(true);
    if (useAuthStore.persist?.hasHydrated?.()) {
      apply();
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(apply);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // Nom à afficher — on préfère la partie locale de l'email plutôt que la
  // chaîne « Utilisateur » quand `name` est vide ou que des espaces (cas
  // fréquent avec les comptes Google OAuth sans `name` ou les vieux signups
  // qui n'imposaient pas le champ).
  const trimmedName = user?.name?.trim();
  const emailLocal = user?.email?.split('@')[0];
  const displayName = trimmedName || emailLocal || t('common.user');

  const initials = (trimmedName || emailLocal || 'U')
    .split(/[\s.\-_@]+/)
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
          // `start-0` + `border-e` are logical: in LTR they render as left:0 /
          // border-right, in RTL they auto-flip to right:0 / border-left so the
          // drawer hugs the correct edge in Arabic.
          'fixed inset-y-0 start-0 z-50 flex h-full w-72 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300',
          'md:sticky md:top-0 md:z-30 md:h-screen md:w-64 md:translate-x-0',
          // `translate-x` always means physical X, so we pair the LTR variant
          // (-translate-x-full hides off the left) with the RTL variant
          // (translate-x-full hides off the right) for the closed state.
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full md:translate-x-0 md:rtl:translate-x-0'
        )}
      >
        {/* Logo + close (mobile) */}
        <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border/60 px-5 py-4">
          <Link
            href="/dashboard"
            className="flex items-center"
            aria-label={t('sidebar.brandAria')}
          >
            <BrandLogo variant="color" width={130} priority />
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label={t('sidebar.closeMenu')}
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
                  // Items can carry ?tab=… in their href (e.g. /dashboard/profile?tab=stores).
                  // Strip it before comparing to the pathname, then check the
                  // tab separately so the right sub-link lights up.
                  const [itemPath, itemQuery = ''] = item.href.split('?');
                  const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null;
                  const pathMatches =
                    pathname === itemPath ||
                    (itemPath !== '/dashboard' && pathname.startsWith(itemPath));
                  const isActive = itemTab
                    ? pathMatches && currentTab === itemTab
                    : pathMatches && !(
                        // Don't mark the bare /dashboard/profile entry active
                        // while a sibling tab-specific entry is the real target.
                        section.items.some((other) => {
                          const [otherPath, otherQuery = ''] = other.href.split('?');
                          const otherTab = otherQuery ? new URLSearchParams(otherQuery).get('tab') : null;
                          return otherPath === itemPath && otherTab && otherTab === currentTab;
                        })
                      );
                  // L'entrée "Applications" déploie ses apps installées en
                  // sous-items quand il y en a — accès direct depuis la
                  // sidebar avec leur logo gradient.
                  const showInstalled = item.href === '/dashboard/apps' && installedApps.length > 0;
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
                          <span className="absolute -start-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full gradient-brand" />
                        )}
                        <item.icon className="h-[17px] w-[17px] shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                        {showInstalled && (
                          <span className="ms-auto rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                            {installedApps.length}
                          </span>
                        )}
                      </Link>
                      {showInstalled && (
                        <ul className="ms-3 mt-0.5 space-y-0.5 border-s border-border/40 ps-2.5">
                          {installedApps.map((app) => {
                            const SubIcon = app.icon;
                            const subActive = pathname === app.href.split('?')[0];
                            return (
                              <li key={app.id}>
                                <Link
                                  href={app.href}
                                  onClick={onMobileClose}
                                  className={cn(
                                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                                    subActive
                                      ? 'bg-primary/8 text-primary font-medium'
                                      : 'text-foreground/65 hover:bg-sidebar-muted hover:text-foreground'
                                  )}
                                >
                                  <span className={cn(
                                    'grid h-5 w-5 shrink-0 place-items-center rounded-md bg-gradient-to-br text-white shadow-sm',
                                    app.accent,
                                  )}>
                                    <SubIcon className="h-3 w-3" />
                                  </span>
                                  <span className="truncate">{app.name}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
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
              <span className="flex-1">{t('sidebar.adminMode')}</span>
              {/* Arrow always points "forward" in reading direction → flip in RTL. */}
              <ArrowRight className="h-3.5 w-3.5 opacity-80 transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
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
              {hydrated ? initials : 'U'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-foreground">
                {hydrated ? displayName : <span className="inline-block h-3 w-20 animate-pulse rounded bg-muted" />}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {hydrated ? user?.email : <span className="inline-block h-2.5 w-24 animate-pulse rounded bg-muted/70" />}
              </div>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
