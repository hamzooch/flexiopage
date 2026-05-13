'use client';

/**
 * Admin shell — sidebar + topbar + main. Distinct visual identity from the
 * seller dashboard (red accent ring, "Admin" badge) so it's immediately
 * obvious you're operating on platform-wide data.
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
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';

const NAV = [
  { href: '/admin', label: 'Vue d\'ensemble', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/stores', label: 'Boutiques', icon: Store },
  { href: '/admin/orders', label: 'Commandes', icon: ShoppingCart },
  { href: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { href: '/admin/complaints', label: 'Réclamations', icon: MessageSquare },
  { href: '/admin/profile', label: 'Profil', icon: UserIcon },
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

  // Owners (and the platform founder by email) get a one-click jump to the
  // seller-side dashboard. We keep the explicit email in addition to the role
  // check so the founder's account never loses access even if the role string
  // gets renamed during a future refactor.
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
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/60 bg-card transition-transform md:sticky md:top-0 md:z-30 md:w-64 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-16 bottom-32 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />

        <div className="relative flex items-center justify-between px-5 py-5">
          <Link href="/admin" className="group flex items-center gap-3" aria-label="FlexioPage Admin">
            <BrandLogo variant="color" width={130} priority />
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700">
              <RoleIcon className="h-3 w-3" strokeWidth={2.5} />
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

        <nav className="relative flex-1 space-y-0.5 px-3 pb-3">
          {NAV.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'text-rose-700'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                {isActive && (
                  <>
                    <span className="absolute inset-0 -z-10 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/20" />
                    <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-rose-500" />
                  </>
                )}
                <item.icon className="h-[17px] w-[17px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Switch back + user */}
        <div className="relative space-y-2 border-t border-border/60 p-3">
          {canSwitchToOwner ? (
            <Link
              href="/dashboard"
              className="group flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-500/30 transition-transform hover:scale-[1.02]"
            >
              <Briefcase className="h-4 w-4" />
              <span className="flex-1">Dashboard Owner</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir le dashboard vendeur
            </Link>
          )}
          <div className="flex items-center gap-2 rounded-xl px-2 py-2">
            <Link
              href="/admin/profile"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 transition hover:bg-muted/50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-orange-600 text-xs font-semibold text-white shadow-md">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user?.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => { logout(); router.push('/'); }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Logout"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Admin</span>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-foreground/70">{labelFromPath(pathname)}</span>
              </div>
              <h1 className="truncate text-lg font-semibold tracking-tight">{labelFromPath(pathname)}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canSwitchToOwner && (
              <Link
                href="/dashboard"
                title="Aller au dashboard vendeur"
                className="group hidden h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 px-3.5 text-xs font-bold text-white shadow-md shadow-fuchsia-500/30 transition-transform hover:scale-[1.03] sm:inline-flex"
              >
                <Briefcase className="h-3.5 w-3.5" />
                Dashboard Owner
                <ExternalLink className="h-3 w-3 opacity-80 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            <span className="hidden items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 sm:inline-flex">
              <RoleIcon className="h-3.5 w-3.5" />
              {meta.mode}
            </span>
            <Link
              href="/admin/profile"
              title="Mon profil"
              className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-orange-600 text-[10px] font-bold text-white shadow-md transition hover:scale-105"
            >
              {initials}
            </Link>
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
  if (path === '/admin') return 'Vue d\'ensemble';
  const map: Record<string, string> = {
    users: 'Utilisateurs',
    stores: 'Boutiques',
    orders: 'Commandes',
    wallets: 'Wallets',
    complaints: 'Réclamations',
    profile: 'Profil',
  };
  const seg = path.split('/')[2];
  return map[seg] || seg || 'Admin';
}
