'use client';

/**
 * Bell dropdown showing the seller's recent in-app notifications:
 *   - unread badge count, refreshed every 30s + on dropdown open
 *   - click item → marks it read + navigates to `link`
 *   - "Tout marquer comme lu" footer action
 *
 * Sources surfaced here come from the backend Notification model:
 *   - order.created            (new COD / paid order)
 *   - order.status_changed     (MogaDelivery webhook update)
 *   - team.member_added/removed
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2, Package, ShoppingCart, Truck, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  notificationsApi,
  type NotificationDoc,
  type NotificationType,
} from '@/lib/api';

const POLL_INTERVAL_MS = 30_000;

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  'order.created': ShoppingCart,
  'order.status_changed': Truck,
  'team.member_added': UsersRound,
  'team.member_removed': UsersRound,
};

const TYPE_TINT: Record<NotificationType, string> = {
  'order.created': 'bg-emerald-500/15 text-emerald-600',
  'order.status_changed': 'bg-indigo-500/15 text-indigo-600',
  'team.member_added': 'bg-fuchsia-500/15 text-fuchsia-600',
  'team.member_removed': 'bg-amber-500/15 text-amber-700',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} j`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDoc[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await notificationsApi.unreadCount();
      setCount(res.data.count);
    } catch {
      // Silent — bell stays at last known count.
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ limit: 10 });
      setItems(res.data.notifications);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s polling on the unread count. The full list only
  // refetches when the dropdown opens, to keep the steady-state cost low.
  useEffect(() => {
    refreshCount();
    const id = window.setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // Open dropdown → fetch the latest list (don't rely on cached items).
  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleItemClick(n: NotificationDoc) {
    setOpen(false);
    if (!n.read) {
      // Optimistic update so the badge drops immediately.
      setCount((c) => Math.max(0, c - 1));
      setItems((arr) => arr.map((it) => (it._id === n._id ? { ...it, read: true } : it)));
      notificationsApi.markRead(n._id).catch(() => {
        // Roll back if server failed.
        setCount((c) => c + 1);
        setItems((arr) => arr.map((it) => (it._id === n._id ? { ...it, read: false } : it)));
      });
    }
    if (n.link) router.push(n.link);
  }

  async function handleMarkAllRead() {
    if (count === 0) return;
    setCount(0);
    setItems((arr) => arr.map((it) => ({ ...it, read: true })));
    try {
      await notificationsApi.markAllRead();
    } catch {
      // Best-effort — refresh on next poll fixes inconsistency.
      refreshCount();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-semibold text-white shadow">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <div
        className={cn(
          'absolute right-0 top-12 z-30 w-80 origin-top-right rounded-2xl border border-border/70 bg-card shadow-xl shadow-foreground/5 transition-all sm:w-96',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        )}
        role="menu"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Notifications</h3>
            <p className="text-[11px] text-muted-foreground">
              {count === 0 ? 'Tout est à jour' : `${count} non lue${count > 1 ? 's' : ''}`}
            </p>
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tout lire
            </button>
          )}
        </header>

        <div className="max-h-[420px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-muted">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Pas de notifications</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tes commandes et événements d'équipe apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] || Bell;
                const tint = TYPE_TINT[n.type] || 'bg-muted text-foreground';
                return (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                        !n.read && 'bg-primary/[0.03]'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                          tint
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('truncate text-sm', !n.read && 'font-semibold')}>
                            {n.title}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      </div>
                      {!n.read && (
                        <span
                          aria-hidden
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fuchsia-500"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
