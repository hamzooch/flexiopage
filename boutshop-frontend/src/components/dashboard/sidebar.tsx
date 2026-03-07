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
  Wallet,
  UserRound,
  X,
  LifeBuoy,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/stores', label: 'Boutiques', icon: Store },
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Vente',
    items: [
      { href: '/dashboard/products', label: 'Produits', icon: Package },
      { href: '/dashboard/pages', label: 'Landing pages', icon: FileText },
      { href: '/dashboard/pages/poster', label: 'Affiche IA', icon: ImageIcon },
      { href: '/dashboard/orders', label: 'Commandes', icon: ShoppingCart },
      { href: '/dashboard/customers', label: 'Clients', icon: Users },
    ],
  },
  {
    title: 'Compte',
    items: [
      { href: '/dashboard/wallet', label: 'Solde', icon: Wallet },
      { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
      { href: '/dashboard/integrations', label: 'Intégrations', icon: Plug },
      { href: '/dashboard/profile', label: 'Profil', icon: UserRound },
      { href: '/dashboard/settings', label: 'Paramètres', icon: Settings },
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
  const initials = (user?.name || user?.email || 'U')
    .split(/[\s@]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300',
          'md:sticky md:top-0 md:z-30 md:w-64 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-32 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />

        {/* Logo + close (mobile) */}
        <div className="relative flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" className="group flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl gradient-brand shadow-lg shadow-primary/30 transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Bout<span className="gradient-brand-text">Shop</span>
            </span>
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
        <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {section.title}
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
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                          isActive
                            ? 'text-primary'
                            : 'text-foreground/70 hover:bg-sidebar-muted hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="absolute inset-0 -z-10 rounded-xl bg-primary/10 ring-1 ring-primary/15" />
                        )}
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full gradient-brand" />
                        )}
                        <item.icon
                          className={cn(
                            'h-[17px] w-[17px] transition-transform duration-200',
                            isActive ? 'scale-110' : 'group-hover:scale-110'
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div className="relative border-t border-sidebar-border p-3">
          <Link
            href="/dashboard/profile"
            onClick={onMobileClose}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-muted"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-brand text-xs font-semibold text-white shadow-md">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {user?.name || 'User'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.email}
              </div>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
