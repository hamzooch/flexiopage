'use client';

/**
 * Admin shell — fixed sidebar + topbar + main. Distinct visual identity
 * from the seller dashboard (rose accent + "Admin" badge) so it's
 * immediately obvious you're operating on platform-wide data.
 *
 * Sidebar is sticky full-viewport-height with its own internal scroll,
 * so the nav stays visible even when the main content scrolls.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Store,
  ShoppingCart,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ExternalLink,
  MessageSquare,
  Crown,
  Eye,
  User as UserIcon,
  Briefcase,
  DollarSign,
  Activity,
  Sliders,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; }

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Plateforme',
    items: [
      { href: '/admin',          label: "Vue d'ensemble", icon: LayoutDashboard },
      { href: '/admin/activity', label: 'Activité',        icon: Activity },
      { href: '/admin/orders',   label: 'Commandes',      icon: ShoppingCart },
    ],
  },
  {
    title: 'Comptes',
    items: [
      { href: '/admin/users',      label: 'Utilisateurs', icon: Users },
      { href: '/admin/stores',     label: 'Boutiques',    icon: Store },
      { href: '/admin/wallets',    label: 'Wallets',      icon: Wallet },
      { href: '/admin/complaints', label: 'Réclamations', icon: MessageSquare },
    ],
  },
  {
    title: 'Système',
    items: [
      { href: '/admin/pricing',  label: 'Tarifs AI',  icon: DollarSign },
      { href: '/admin/settings', label: 'Réglages',   icon: Sliders },
      { href: '/admin/profile',  label: 'Profil',     icon: UserIcon },
    ],
  },
];

type StaffRole = 'owner' | 'superadmin' | 'admin' | 'supervisor';

const ROLE_META: Record<StaffRole, { label: string; short: string; mode: string; Icon: typeof Crown }> = {
  owner:      { label: 'Owner',       short: 'Owner',       mode: 'Mode owner',         Icon: Crown },
  superadmin: { label: 'Super admin', short: 'Super admin', mode: 'Mode super-admin',   Icon: ShieldAlert },
  admin:      { label: 'Admin',       short: 'Admin',       mode: 'Mode administrateur',Icon: ShieldCheck },
  supervisor: { label: 'Superviseur', short: 'Superviseur', mode: 'Mode superviseur',   Icon: Eye },
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  const role = (user?.role as StaffRole | undefined) || 'admin';
  const meta = ROLE_META[role] || ROLE_META.admin;
  const RoleIcon = meta.Icon;

  const FOUNDER_EMAIL = 'teyeb.hamza12@gmail.com';
  const canSwitchToOwner =
    role === 'owner' || user?.email?.toLowerCase() === FOUNDER_EMAIL;

  const initials = (user?.name || user?.email || 'A')
    .split(/[\s@]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setOpen(false)}
      />

      {/* Sidebar — sticky full height with internal scroll */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform duration-300',
          'md:sticky md:top-0 md:z-30 md:h-screen md:w-64 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-5 py-4">
          <Link href="/admin" className="flex items-center gap-2.5" aria-label="FlexioPage Admin">
            <BrandLogo variant="color" width={120} priority />
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-500/20">
              <RoleIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
              {meta.short}
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav — only this section scrolls */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-rose-500/10 text-rose-700'
                            : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-rose-500" />
                        )}
                        <item.icon className={cn('h-[17px] w-[17px] shrink-0', isActive && 'text-rose-600')} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Switch to owner dashboard (sticky bottom) */}
        {canSwitchToOwner && (
          <div className="shrink-0 border-t border-border/60 px-3 pt-3">
            <Link
              href="/dashboard"
              className="group flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition-transform hover:scale-[1.01]"
            >
              <Briefcase className="h-4 w-4" />
              <span className="flex-1">Dashboard Owner</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}

        {/* User row */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <Link
            href="/admin/profile"
            className="flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-muted/60"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-orange-600 text-[11px] font-semibold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={async () => { await logout(); router.replace('/login'); }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border/60 bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Admin</span>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-foreground/70">{labelFromPath(pathname)}</span>
              </div>
              <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{labelFromPath(pathname)}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-500/20 sm:inline-flex">
              <RoleIcon className="h-3 w-3" />
              {meta.mode}
            </span>
            <Link
              href="/admin/profile"
              title="Mon profil"
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-orange-600 text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-105"
            >
              {initials}
            </Link>
            <button
              type="button"
              onClick={async () => { await logout(); router.replace('/login'); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              title="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function labelFromPath(path: string): string {
  if (path === '/admin') return "Vue d'ensemble";
  const map: Record<string, string> = {
    users: 'Utilisateurs',
    stores: 'Boutiques',
    orders: 'Commandes',
    wallets: 'Wallets',
    pricing: 'Tarifs AI',
    complaints: 'Réclamations',
    activity: 'Activité',
    profile: 'Profil',
  };
  const seg = path.split('/')[2];
  return map[seg] || seg || 'Admin';
}
