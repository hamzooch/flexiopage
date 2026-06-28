'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, Repeat, Search, Settings as SettingsIcon, Store as StoreIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, readPersistedUser } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { WalletBadges } from '@/components/dashboard/wallet-badges';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';
import { LanguageSwitcher } from '@/components/dashboard/language-switcher';
import { useT } from '@/lib/i18n';

function prettySegment(seg: string) {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mongo ObjectIds are 24 lowercase hex chars. Detect them so the breadcrumb
// doesn't dump "6a1727a316b93972ddc08ac9" in the seller's face.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
function isObjectId(seg: string): boolean {
  return OBJECT_ID_RE.test(seg);
}

interface Props {
  onOpenMobileNav?: () => void;
}

export function Header({ onOpenMobileNav }: Props = {}) {
  const logout = useAuthStore((s) => s.logout);
  // Live store + fallback localStorage : la réhydratation zustand peut laisser
  // `user` à null au render → l'avatar/menu afficherait « U »/placeholder. Le
  // fallback garantit le nom/initiales dès le 1ᵉʳ rendu client.
  const liveUser = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const user = liveUser ?? (mounted ? readPersistedUser() : null);
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const [activeStoreName, setActiveStoreName] = useState<string | null>(null);
  const { t } = useT();

  // On gate l'affichage du nom/email sur la PRÉSENCE de `user` plutôt que sur
  // un flag d'hydratation persist : ce dernier pouvait rester bloqué à false
  // (timing de rehydration zustand) et figer le menu sur des placeholders.
  // `user` est réactif et null au 1ᵉʳ rendu (SSR + client avant rehydration)
  // → pas de mismatch, et la vraie valeur s'affiche dès le store hydraté.

  // The header shows which store the dashboard is currently scoped to. We
  // fetch the name lazily so we don't add a heavy load — list endpoint is
  // already cached on most pages.
  useEffect(() => {
    if (!currentStoreId) { setActiveStoreName(null); return; }
    let cancelled = false;
    storesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const list = (res.data as { stores: { _id: string; name: string }[] }).stores || [];
        const found = list.find((s) => s._id === currentStoreId);
        setActiveStoreName(found?.name || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentStoreId]);

  const segments = pathname.split('/').filter(Boolean);
  const lastSeg = segments[segments.length - 1] || '';
  let title: string;
  if (segments.length <= 1) {
    title = t('header.overview');
  } else if (isObjectId(lastSeg) && lastSeg === currentStoreId && activeStoreName) {
    // Landing on /dashboard/stores/<storeId> — show the store's name.
    title = activeStoreName;
  } else if (isObjectId(lastSeg)) {
    // Generic ObjectId (order, product…) — keep the last 6 chars so it stays
    // visually distinct from a slug but doesn't dominate the header.
    title = `#${lastSeg.slice(-6)}`;
  } else {
    title = prettySegment(lastSeg);
  }
  // Best display name we can build for this user. Falls back to the email
  // username (before @) when `name` is missing/blank — much friendlier than
  // a generic "Utilisateur" translation when we actually know who it is.
  const trimmedName = user?.name?.trim();
  const emailLocal = user?.email?.split('@')[0];
  const displayName = trimmedName || emailLocal || t('common.user');

  const initials = (trimmedName || emailLocal || 'U')
    .split(/[\s.\-_]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function handleLogout() {
    logout();
    // Clear the persisted store selection so a different user logging in
    // on the same device doesn't enter a store they don't own.
    useStoreStore.getState().clearCurrentStore();
    // `replace` pour évincer le dashboard de l'historique — sans ça, la flèche
    // retour ramène sur une page protégée qui re-redirige sur /login.
    router.replace('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      {/* Title + breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground md:hidden"
          aria-label={t('header.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t('header.dashboard')}</span>
            {segments.length > 1 && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="truncate text-foreground/70">{title}</span>
              </>
            )}
          </div>
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        </div>
      </div>

      {/* Search */}
      <div className="hidden flex-1 max-w-md md:block">
        <div className="group relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <input
            type="search"
            placeholder={t('header.searchPlaceholder')}
            className="h-10 w-full rounded-xl border border-border/70 bg-muted/40 ps-10 pe-12 text-sm placeholder:text-muted-foreground/70 transition-all focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          <kbd className="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* Active store indicator + quick switch. Clicking it returns to
            the store picker so the seller can change scope. */}
        <Link
          href="/select-store"
          className="hidden h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 text-sm transition-all hover:border-primary/40 hover:bg-card sm:inline-flex"
          title={t('header.switchStore')}
        >
          <StoreIcon className="h-4 w-4 text-primary" />
          <span className="max-w-[140px] truncate font-medium">
            {activeStoreName || t('header.chooseStore')}
          </span>
          <Repeat className="h-3 w-3 text-muted-foreground" />
        </Link>

        <WalletBadges />

        <LanguageSwitcher />

        <NotificationsBell />

        {/* Avatar menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="ms-1 grid h-10 w-10 place-items-center rounded-full gradient-brand text-xs font-semibold text-white shadow-md shadow-primary/20 transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-primary/20"
            aria-label={t('header.accountMenu')}
            aria-expanded={menuOpen}
          >
            {initials}
          </button>
          <div
            className={cn(
              // `end-0` keeps the menu anchored to the avatar in both LTR and
              // RTL. The transform origin needs the rtl: variant since
              // Tailwind has no logical `origin-top-end` keyword.
              'absolute end-0 top-12 w-60 origin-top-right rtl:origin-top-left rounded-2xl border border-border/70 bg-card p-2 shadow-xl shadow-foreground/5 transition-all',
              menuOpen
                ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
            )}
            role="menu"
          >
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-brand text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {user ? displayName : <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {user ? user.email : <span className="inline-block h-2.5 w-32 animate-pulse rounded bg-muted/70" />}
                </div>
              </div>
            </div>
            <div className="my-1 h-px bg-border/70" />
            <Link
              href="/select-store"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground sm:hidden"
              role="menuitem"
            >
              <Repeat className="h-4 w-4" />
              {t('header.switchStore')}
            </Link>
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              role="menuitem"
            >
              <User className="h-4 w-4" />
              {t('header.profile')}
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              role="menuitem"
            >
              <SettingsIcon className="h-4 w-4" />
              {t('header.settings')}
            </Link>
            <div className="my-1 h-px bg-border/70" />
            <button
              type="button"
              onMouseDown={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" />
              {t('header.logout')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
