'use client';

/**
 * Announcements dashboard — draft → schedule → send broadcast emails
 * to segments of registered users (all, sellers, active, staff, verified).
 *
 * Layout : liste à gauche + formulaire de composition à droite. Le
 * scheduler cron dans le backend prend le relais à `scheduledAt` sans
 * intervention de l'admin.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2, Send, Calendar, Users, Eye, Trash2, XCircle, CheckCircle2, Clock,
  AlertCircle, Sparkles, Megaphone, RefreshCw, Save, Ban, ArrowLeft,
} from 'lucide-react';

type Audience = 'all' | 'sellers' | 'active' | 'staff' | 'verified';
type Status = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
type Announcement = Awaited<ReturnType<typeof adminApi.listAnnouncements>>['data']['items'][number];

const AUDIENCE_LABELS: Record<Audience, { label: string; hint: string }> = {
  all:      { label: 'Tous les utilisateurs',   hint: 'Tous sauf comptes suspendus' },
  sellers:  { label: 'Vendeurs',                hint: 'Utilisateurs avec ≥1 boutique' },
  active:   { label: 'Actifs',                  hint: 'Connectés dans les 30 derniers jours' },
  staff:    { label: 'Staff',                   hint: 'Owner / superadmin / admin / supervisor' },
  verified: { label: 'Emails vérifiés',         hint: 'Meilleure délivrabilité' },
};

const STATUS_META: Record<Status, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  draft:     { label: 'Brouillon',       icon: Save,          color: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
  scheduled: { label: 'Programmé',       icon: Calendar,      color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  sending:   { label: 'Envoi en cours…', icon: Loader2,       color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  sent:      { label: 'Envoyé',          icon: CheckCircle2,  color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Annulé',          icon: XCircle,       color: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listAnnouncements(filter === 'all' ? undefined : { status: filter });
      setItems(data.items);
      setCounts(data.counts);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Megaphone className="h-6 w-6 text-orange-600" />
            Annonces & actualités
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envoie des emails groupés à tes vendeurs — programme un envoi ou envoie tout de suite.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Nouvelle annonce
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Total" value={items.length} tone="slate" onClick={() => setFilter('all')} active={filter === 'all'} />
        <StatCard label="Brouillons" value={counts.draft || 0} tone="slate" onClick={() => setFilter('draft')} active={filter === 'draft'} />
        <StatCard label="Programmés" value={counts.scheduled || 0} tone="blue" onClick={() => setFilter('scheduled')} active={filter === 'scheduled'} />
        <StatCard label="Envoyés" value={counts.sent || 0} tone="emerald" onClick={() => setFilter('sent')} active={filter === 'sent'} />
        <StatCard label="Annulés" value={counts.cancelled || 0} tone="rose" onClick={() => setFilter('cancelled')} active={filter === 'cancelled'} />
      </div>

      {showForm ? (
        <ComposeForm
          existing={editing}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      ) : (
        <AnnouncementsList
          items={items}
          loading={loading}
          onEdit={(a) => { setEditing(a); setShowForm(true); }}
          onRefresh={load}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────
function AnnouncementsList({
  items, loading, onEdit, onRefresh,
}: {
  items: Announcement[];
  loading: boolean;
  onEdit: (a: Announcement) => void;
  onRefresh: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAction(id: string, action: 'send' | 'cancel' | 'delete') {
    if (action === 'delete' && !window.confirm('Supprimer cette annonce ?')) return;
    if (action === 'send' && !window.confirm('Envoyer maintenant à toute l\'audience ?')) return;
    if (action === 'cancel' && !window.confirm('Annuler cette annonce programmée ?')) return;
    setBusyId(id);
    try {
      if (action === 'send') await adminApi.sendAnnouncementNow(id);
      if (action === 'cancel') await adminApi.cancelAnnouncement(id);
      if (action === 'delete') await adminApi.deleteAnnouncement(id);
      onRefresh();
    } catch (err) {
      alert('Erreur : ' + ((err as Error).message || 'inconnue'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="grid place-items-center gap-2 py-16 text-center">
          <Megaphone className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucune annonce pour l&apos;instant.</p>
          <p className="text-xs text-muted-foreground">Clique &quot;Nouvelle annonce&quot; en haut pour envoyer ta première communication.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((a) => {
        const meta = STATUS_META[a.status];
        const StatusIcon = meta.icon;
        const audMeta = AUDIENCE_LABELS[a.audience];
        return (
          <Card key={a._id} className="overflow-hidden">
            <CardContent className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta.color)}>
                    <StatusIcon className={cn('h-3 w-3', a.status === 'sending' && 'animate-spin')} />
                    {meta.label}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {audMeta.label}
                  </span>
                </div>
                <h3 className="truncate text-sm font-semibold">{a.title}</h3>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {a.scheduledAt && <span>📅 Programmé pour {fmtDate(a.scheduledAt)}</span>}
                  {a.sentAt && <span>✅ Envoyé le {fmtDate(a.sentAt)}</span>}
                  {a.stats && (
                    <span>
                      📊 {a.stats.sent}/{a.stats.targeted} envoyés
                      {a.stats.failed > 0 && <span className="text-rose-600"> · {a.stats.failed} échec(s)</span>}
                    </span>
                  )}
                  <span>Créé le {fmtDate(a.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {a.status === 'draft' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onEdit(a)} className="gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Éditer
                    </Button>
                    <Button size="sm" onClick={() => handleAction(a._id, 'send')} disabled={busyId === a._id} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Envoyer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleAction(a._id, 'delete')} disabled={busyId === a._id} className="gap-1.5 text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {a.status === 'scheduled' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onEdit(a)} className="gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Éditer
                    </Button>
                    <Button size="sm" onClick={() => handleAction(a._id, 'send')} disabled={busyId === a._id} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Envoyer maintenant
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleAction(a._id, 'cancel')} disabled={busyId === a._id} className="gap-1.5 text-rose-600">
                      <Ban className="h-3.5 w-3.5" /> Annuler
                    </Button>
                  </>
                )}
                {a.status === 'sent' && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(a)} className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Voir
                  </Button>
                )}
                {busyId === a._id && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COMPOSE FORM
// ─────────────────────────────────────────────────────────────────────
function ComposeForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: Announcement | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.title || '');
  const [subject, setSubject] = useState(existing?.subject || '');
  const [bodyHtml, setBodyHtml] = useState(existing?.bodyHtml || '');
  const [audience, setAudience] = useState<Audience>((existing?.audience as Audience) || 'sellers');
  const [scheduledAt, setScheduledAt] = useState<string>(
    existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'schedule' | 'send' | null>(null);
  const [error, setError] = useState('');
  const readOnly = existing?.status === 'sent' || existing?.status === 'sending';

  // Live audience count preview
  useEffect(() => {
    let alive = true;
    setAudienceLoading(true);
    adminApi.previewAnnouncementAudience(audience)
      .then((res) => { if (alive) setAudienceCount(res.data.count); })
      .catch(() => { if (alive) setAudienceCount(null); })
      .finally(() => { if (alive) setAudienceLoading(false); });
    return () => { alive = false; };
  }, [audience]);

  async function handleSave(action: 'draft' | 'schedule' | 'send_now') {
    setError('');
    if (!title.trim()) { setError('Le titre est obligatoire.'); return; }
    if (!bodyHtml.trim()) { setError('Le contenu est obligatoire.'); return; }
    if (action === 'schedule' && !scheduledAt) { setError('Choisis une date d\'envoi.'); return; }

    const busyKey = action === 'send_now' ? 'send' : action;
    setBusy(busyKey);
    try {
      const payload = {
        title: title.trim(),
        subject: subject.trim() || undefined,
        bodyHtml,
        audience,
        action,
        scheduledAt: action === 'schedule' ? new Date(scheduledAt).toISOString() : undefined,
      };
      if (existing && existing.status !== 'sent') {
        // Update existing draft/scheduled
        await adminApi.updateAnnouncement(existing._id, {
          title: payload.title,
          subject: payload.subject,
          bodyHtml: payload.bodyHtml,
          audience: payload.audience,
          scheduledAt: payload.scheduledAt,
        });
        if (action === 'send_now') await adminApi.sendAnnouncementNow(existing._id);
      } else {
        await adminApi.createAnnouncement(payload);
      }
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
        || (err as Error).message
        || 'Erreur inconnue';
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
        </div>
        <CardTitle>{existing ? (readOnly ? 'Annonce envoyée' : 'Modifier l\'annonce') : 'Nouvelle annonce'}</CardTitle>
        <CardDescription>
          {readOnly
            ? `Envoyé le ${fmtDate(existing.sentAt || existing.updatedAt)} — cette annonce est en lecture seule.`
            : 'Titre + contenu + audience + moment d\'envoi. Programme pour plus tard ou envoie tout de suite.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="title" className="text-xs font-semibold">Titre *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={readOnly}
            placeholder="Nouvelle feature : les payouts automatiques"
            maxLength={200}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Affiché en gros dans l&apos;email. Sert aussi de sujet par défaut.</p>
        </div>

        <div>
          <Label htmlFor="subject" className="text-xs font-semibold">Sujet email (optionnel)</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={readOnly}
            placeholder="Si vide, on utilise le titre"
            maxLength={200}
          />
        </div>

        <div>
          <Label htmlFor="body" className="text-xs font-semibold">Contenu (HTML supporté) *</Label>
          <textarea
            id="body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            disabled={readOnly}
            rows={10}
            placeholder="Bonjour,&#10;&#10;Nous venons de sortir une nouvelle feature qui…&#10;&#10;<a href='https://flexiopage.com/dashboard'>Découvrir</a>"
            className="mt-1.5 flex w-full rounded-xl border border-input bg-background px-4 py-3 font-mono text-xs focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            HTML basique : <code>&lt;strong&gt;</code>, <code>&lt;br&gt;</code>, <code>&lt;a href=&quot;…&quot;&gt;</code>, <code>&lt;p&gt;</code>. Emojis OK.
          </p>
        </div>

        <div>
          <Label className="text-xs font-semibold">Audience *</Label>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => {
              const meta = AUDIENCE_LABELS[a];
              const active = audience === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => !readOnly && setAudience(a)}
                  disabled={readOnly}
                  className={cn(
                    'flex flex-col rounded-xl border-2 p-3 text-left transition-all disabled:opacity-60',
                    active ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4" />
                    {meta.label}
                    {active && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{meta.hint}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
            {audienceLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>
              {audienceCount !== null ? (
                <>Cette annonce sera envoyée à <strong>{audienceCount} destinataire(s)</strong>.</>
              ) : (
                <>Chargement du nombre de destinataires…</>
              )}
            </span>
          </div>
        </div>

        <div>
          <Label htmlFor="scheduledAt" className="text-xs font-semibold">Programmer pour (optionnel)</Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={readOnly}
            min={new Date().toISOString().slice(0, 16)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Si vide et clic sur &quot;Envoyer maintenant&quot; → envoi immédiat. Sinon &quot;Programmer&quot; utilise cette date.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <Button variant="outline" onClick={() => handleSave('draft')} disabled={!!busy} className="gap-2">
              {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Sauver brouillon
            </Button>
            <Button variant="outline" onClick={() => handleSave('schedule')} disabled={!!busy || !scheduledAt} className="gap-2">
              {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
              Programmer
            </Button>
            <Button onClick={() => handleSave('send_now')} disabled={!!busy} className="gap-2">
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer maintenant
            </Button>
          </div>
        )}

        {readOnly && existing?.stats && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Résultats</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{existing.stats.sent}</div>
                <div className="text-[11px] text-muted-foreground">Emails envoyés</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{existing.stats.targeted}</div>
                <div className="text-[11px] text-muted-foreground">Destinataires ciblés</div>
              </div>
              <div>
                <div className={cn('text-2xl font-bold', existing.stats.failed > 0 ? 'text-rose-600' : 'text-slate-500')}>
                  {existing.stats.failed}
                </div>
                <div className="text-[11px] text-muted-foreground">Échecs</div>
              </div>
            </div>
            {existing.stats.errors && existing.stats.errors.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-muted-foreground">Erreurs (extrait) :</div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-rose-600">
                  {existing.stats.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label, value, tone, onClick, active,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'blue' | 'emerald' | 'rose';
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    slate:   'text-slate-700 dark:text-slate-300',
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    rose:    'text-rose-600',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col rounded-xl border border-border/60 bg-card p-3 text-left transition-all hover:shadow-md',
        active && 'ring-2 ring-primary/30 bg-primary/5'
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('mt-1 text-2xl font-bold tabular-nums', tones)}>{value}</span>
    </button>
  );
}
