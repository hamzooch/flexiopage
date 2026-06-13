'use client';

/**
 * Gestion du WhatsApp Bot pour une boutique. Connexion par token manuel
 * (WhatsApp Cloud API), puis config / test / inbox / stats — réutilise le
 * cerveau partagé via les endpoints channel=whatsapp.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Check, Send, MessageSquare, RefreshCw, Power, AlertTriangle, Sparkles, Plug, QrCode } from 'lucide-react';
import { whatsappBotApi, extractApiError, type MessengerBotConfig, type MessengerConversation, type MessengerMessage } from '@/lib/api';
import { COUNTRIES, COUNTRY_GROUPS } from '@/data/countries';
import { useStoreStore } from '@/stores/store-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Overview = Awaited<ReturnType<typeof whatsappBotApi.statsOverview>>['data'];

export default function WhatsAppBotPage() {
  const params = useSearchParams();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const storeId = params.get('storeId') || currentStoreId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<MessengerBotConfig | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  /**
   * Force l'affichage du picker même quand un bot est déjà connecté — permet
   * au vendeur de basculer entre Meta Cloud et WasenderAPI. Le bouton Retour
   * du picker remet ce flag à false.
   */
  const [showPicker, setShowPicker] = useState(false);
  // Panels Debug Worker + Debug Webhooks : utiles pendant le rodage du
  // bot, masqués par défaut une fois l'intégration stable. Persisté en
  // localStorage pour que le toggle survive aux refresh.
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDevMode(localStorage.getItem('flexiopage:wasender:devMode') === '1');
    }
  }, []);
  const toggleDevMode = () => {
    const next = !devMode;
    setDevMode(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('flexiopage:wasender:devMode', next ? '1' : '0');
    }
  };

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await whatsappBotApi.getConfig(storeId);
      setConfig(res.data.config);
      if (res.data.connected) {
        const ov = await whatsappBotApi.statsOverview(storeId).catch(() => null);
        setOverview(ov?.data || null);
        // Trigger backfill du wasender_session_token_hash si manquant — le
        // hash est nécessaire pour que les webhooks entrants matchent la
        // bonne BotConfig (Wasender envoie l'API token comme sessionId).
        if (res.data.config?.whatsapp_provider === 'wasender') {
          await whatsappBotApi.wasenderStatus(storeId).catch(() => null);
        }
      }
    } catch (err) {
      setError(extractApiError(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  if (!storeId) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sélectionne une boutique d'abord.</div>;
  }
  if (loading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        title="WhatsApp Bot"
        description="Assistant IA sur WhatsApp : répond aux clients en darija/français et crée les commandes COD."
        actions={config?.status === 'active' ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <Check className="h-3 w-3" strokeWidth={3} /> Connecté
            </span>
            {config && (
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {config.whatsapp_provider === 'wasender' ? 'Wasender' : 'Meta Cloud'}
              </span>
            )}
          </span>
        ) : undefined}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {(!config || showPicker) && (
        <ProviderPicker
          storeId={storeId}
          onConnected={async () => { setShowPicker(false); await load(); }}
          onClose={config ? () => setShowPicker(false) : undefined}
        />
      )}

      {config && showUpdate && (
        config.whatsapp_provider === 'wasender' ? (
          <WasenderConnectForm storeId={storeId} mode="update" onCancel={() => setShowUpdate(false)} onConnected={async () => { setShowUpdate(false); await load(); }} />
        ) : (
          <ConnectForm
            storeId={storeId}
            mode="update"
            currentNumber={config.whatsapp_display_number}
            onCancel={() => setShowUpdate(false)}
            onConnected={async () => { setShowUpdate(false); await load(); }}
          />
        )
      )}

      {config && !showUpdate && !showPicker && config.whatsapp_provider === 'wasender' && config.status !== 'active' && (
        <WasenderSessionStatus storeId={storeId} onConnected={load} />
      )}

      {config && !showUpdate && !showPicker && (
        <>
          {overview && <StatsRow overview={overview} />}
          <div className="grid gap-6 lg:grid-cols-2">
            <ConfigForm storeId={storeId} config={config} onSaved={load} />
            <TestBox storeId={storeId} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-gradient-to-br from-green-500/5 to-emerald-600/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Messagerie</div>
              <p className="text-xs text-muted-foreground">Vue plein écran type WhatsApp Web : consulter et répondre aux clients.</p>
            </div>
            <Link href={`/dashboard/apps/whatsapp-bot/chat?storeId=${encodeURIComponent(storeId)}`} className="shrink-0">
              <Button size="sm" className="w-full gap-1.5 gradient-brand text-white sm:w-auto">
                <MessageSquare className="h-3.5 w-3.5" /> Ouvrir la messagerie
              </Button>
            </Link>
          </div>
          <Inbox storeId={storeId} />
          {config.whatsapp_provider === 'wasender' && devMode && (
            <>
              <WasenderWorkerDebug storeId={storeId} />
              <WasenderWebhookDebug storeId={storeId} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setShowUpdate(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Mettre à jour le numéro
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setShowPicker(true)}>
              <Plug className="h-3.5 w-3.5" /> Changer de fournisseur
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-rose-600"
              onClick={async () => {
                if (!confirm('Déconnecter WhatsApp ?')) return;
                if (config.whatsapp_provider === 'wasender') {
                  await whatsappBotApi.wasenderDisconnect(storeId);
                } else {
                  await whatsappBotApi.disconnect(storeId);
                }
                await load();
              }}>
              <Power className="h-3.5 w-3.5" /> Déconnecter WhatsApp
            </Button>
            {config.whatsapp_provider === 'wasender' && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={toggleDevMode} title="Affiche/masque les panels Debug Worker + Debug Webhooks">
                {devMode ? '🛠️ Mode dev (ON)' : '🛠️ Mode dev'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ConnectForm({ storeId, onConnected, mode = 'connect', currentNumber, onCancel }: {
  storeId: string;
  onConnected: () => void;
  /** 'connect' = première connexion ; 'update' = changement de numéro (ré-saisie). */
  mode?: 'connect' | 'update';
  /** Numéro actuellement relié, affiché pour contexte en mode update. */
  currentNumber?: string;
  onCancel?: () => void;
}) {
  const isUpdate = mode === 'update';
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function connect() {
    setBusy(true); setErr('');
    try {
      await whatsappBotApi.connect(storeId, { phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim(), wabaId: wabaId.trim() || undefined });
      onConnected();
    } catch (e) {
      setErr(extractApiError(e, 'Connexion échouée. Vérifie le phone_number_id et le token.'));
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-dashed border-border/70 bg-card p-6">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
        <MessageSquare className="h-7 w-7" />
      </div>
      <h2 className="text-center text-base font-semibold">
        {isUpdate ? 'Mettre à jour le numéro WhatsApp' : 'Connecter WhatsApp (Cloud API)'}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted-foreground">
        {isUpdate ? (
          <>Colle le <strong>nouveau Phone number ID</strong> (Meta → WhatsApp → Configuration de l'API) et un
          <strong> token d'accès</strong> valide. Ta config (langue, frais, catalogue) est conservée.</>
        ) : (
          <>Depuis Meta → WhatsApp → Configuration de l'API, copie le <strong>Phone number ID</strong> et un
          <strong> token d'accès</strong>, puis colle-les ici.</>
        )}
      </p>
      {isUpdate && currentNumber && (
        <p className="mx-auto mt-2 max-w-md text-center text-xs text-muted-foreground">
          Numéro actuel : <strong>{currentNumber}</strong>
        </p>
      )}
      <div className="mx-auto mt-5 max-w-md space-y-3">
        <div className="space-y-1"><Label className="text-xs">{isUpdate ? 'Nouveau Phone number ID' : 'Phone number ID'}</Label>
          <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" className="h-10" /></div>
        <div className="space-y-1"><Label className="text-xs">Token d'accès</Label>
          <Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAG..." type="password" className="h-10" /></div>
        <div className="space-y-1"><Label className="text-xs">WhatsApp Business Account ID (optionnel)</Label>
          <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="optionnel" className="h-10" /></div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={busy} className="gap-2">{isUpdate ? 'Annuler' : 'Retour'}</Button>
          )}
          <Button onClick={connect} disabled={busy || !phoneNumberId.trim() || !accessToken.trim()} className="w-full gap-2 gradient-brand text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} {isUpdate ? 'Mettre à jour' : 'Connecter'}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Webhook à configurer côté Meta : <code>…/webhook/whatsapp</code> (verify token = MESSENGER_VERIFY_TOKEN).
        </p>
      </div>
    </section>
  );
}

function StatsRow({ overview }: { overview: Overview }) {
  const cards = [
    { label: 'Conversations', value: overview.totalConversations },
    { label: 'Commandes créées', value: overview.ordersCreated },
    { label: 'Taux de conversion', value: `${overview.conversionRate}%` },
    { label: 'Ce mois', value: `${overview.conversationsUsedThisMonth ?? 0}/${overview.conversationsLimit ?? '∞'}` },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{c.value}</div>
        </div>
      ))}
    </section>
  );
}

function ConfigForm({ storeId, config, onSaved }: { storeId: string; config: MessengerBotConfig; onSaved: () => void }) {
  const [form, setForm] = useState({
    language: config.language, country: config.country, ai_personality: config.ai_personality,
    default_shipping_fee: config.default_shipping_fee, welcome_message: config.welcome_message || '',
    auto_create_order: config.auto_create_order, ask_confirmation_before_order: config.ask_confirmation_before_order,
    status: config.status,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true); setMsg('');
    try { await whatsappBotApi.updateConfig(storeId, form); setMsg('Enregistré ✅'); onSaved(); }
    catch (err) { setMsg(extractApiError(err, 'Échec.')); }
    finally { setSaving(false); }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
      <h2 className="text-sm font-semibold">Configuration</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Langue">
          <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as MessengerBotConfig['language'] })}>
            <option value="darija_ma">Darija 🇲🇦</option><option value="darija_dz">Darija 🇩🇿</option>
            <option value="darija_tn">Derja 🇹🇳</option><option value="ar">Arabe</option>
            <option value="fr">Français</option><option value="en">English</option>
          </select>
        </Field>
        <Field label="Pays / marché">
          <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            {COUNTRY_GROUPS.map((g) => {
              const items = COUNTRIES.filter((c) => c.group === g.id);
              if (!items.length) return null;
              return (
                <optgroup key={g.id} label={g.label}>
                  {items.map((c) => (
                    <option key={c.code} value={c.code}>{c.label} ({c.currency})</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
        <Field label="Personnalité">
          <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={form.ai_personality} onChange={(e) => setForm({ ...form, ai_personality: e.target.value as MessengerBotConfig['ai_personality'] })}>
            <option value="friendly">Chaleureux</option><option value="professional">Professionnel</option><option value="energetic">Énergique</option>
          </select>
        </Field>
        <Field label="Livraison par défaut">
          <Input type="number" value={form.default_shipping_fee}
            onChange={(e) => setForm({ ...form, default_shipping_fee: Number(e.target.value) })} className="h-9" />
        </Field>
      </div>
      <Field label="Message d'accueil">
        <textarea value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
          className="min-h-[60px] w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm" placeholder="Salam 😊 …" />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <Toggle label="Bot actif" checked={form.status === 'active'} onChange={(v) => setForm({ ...form, status: v ? 'active' : 'paused' })} />
        <Toggle label="Créer la commande auto" checked={form.auto_create_order} onChange={(v) => setForm({ ...form, auto_create_order: v })} />
        <Toggle label="Confirmer avant commande" checked={form.ask_confirmation_before_order} onChange={(v) => setForm({ ...form, ask_confirmation_before_order: v })} />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer</Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </section>
  );
}

function TestBox({ storeId }: { storeId: string }) {
  const [input, setInput] = useState('Salam, chno 3andkom?');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState('');

  async function run() {
    setLoading(true); setReply(''); setMeta('');
    try {
      const res = await whatsappBotApi.testBot(storeId, input);
      setReply(res.data.reply);
      setMeta(`${res.data.model} · ${res.data.tokens.input}+${res.data.tokens.output} tok · $${res.data.costUsd.toFixed(5)}${res.data.toolsUsed.length ? ' · tools: ' + res.data.toolsUsed.join(',') : ''}`);
    } catch (err) {
      setReply(extractApiError(err, 'Échec — vérifie ANTHROPIC_API_KEY.'));
    } finally { setLoading(false); }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Tester le bot</h2>
      <textarea value={input} onChange={(e) => setInput(e.target.value)}
        className="min-h-[60px] w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm" />
      <Button onClick={run} disabled={loading || !input.trim()} className="gap-1.5">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer
      </Button>
      {reply && (
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="whitespace-pre-line text-sm">{reply}</p>
          {meta && <p className="mt-2 text-[11px] text-muted-foreground">{meta}</p>}
        </div>
      )}
    </section>
  );
}

function Inbox({ storeId }: { storeId: string }) {
  const [convs, setConvs] = useState<MessengerConversation[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    whatsappBotApi.listConversations(storeId, { limit: 30 })
      .then((res) => setConvs(res.data.conversations)).catch(() => setConvs([])).finally(() => setLoading(false));
  }, [storeId]);
  useEffect(() => { refresh(); }, [refresh]);

  async function open(id: string) {
    setSel(id);
    const res = await whatsappBotApi.getConversation(storeId, id);
    setMessages(res.data.messages);
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-muted-foreground" /> Conversations ({convs.length})</h2>
        <button type="button" onClick={refresh} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /></button>
      </div>
      <div className="grid md:grid-cols-[280px_1fr]">
        <ul className="max-h-[420px] divide-y divide-border/40 overflow-y-auto border-r border-border/40">
          {convs.length === 0 && <li className="p-4 text-xs text-muted-foreground">Aucune conversation pour le moment.</li>}
          {convs.map((c) => (
            <li key={c._id}>
              <button type="button" onClick={() => open(c._id)}
                className={cn('w-full px-4 py-2.5 text-left hover:bg-muted/40', sel === c._id && 'bg-primary/5')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.customer_name || c.customer_psid}</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                    c.order_id ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                    {c.order_id ? 'Commande' : c.status}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{c.customer_city || '—'} · {c.message_count} msg</div>
              </button>
            </li>
          ))}
        </ul>
        <div className="max-h-[420px] space-y-2 overflow-y-auto p-4">
          {!sel && <p className="text-xs text-muted-foreground">Sélectionne une conversation.</p>}
          {sel && messages.map((m) => (
            <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm',
              m.sender === 'customer' ? 'bg-muted' : 'ml-auto bg-primary/10')}>
              <div className="text-[9px] font-semibold uppercase text-muted-foreground">{m.sender}</div>
              <p className="whitespace-pre-line">{m.content}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-input" />
      <span className="font-medium">{label}</span>
    </label>
  );
}

/**
 * Choix du fournisseur WhatsApp : Meta Cloud (officiel, gratuit, nécessite
 * compte Meta Business + review) vs WasenderAPI (WhatsApp Web/QR, payant, mise
 * en route immédiate).
 *
 * Tant qu'aucun fournisseur n'est sélectionné (state null), on affiche
 * uniquement les deux cartes de choix. Une fois sélectionné, la form
 * correspondante apparaît avec un bouton "← Retour au choix" pour revenir.
 */
function ProviderPicker({ storeId, onConnected, onClose }: {
  storeId: string;
  onConnected: () => void;
  /** Si fourni : bouton "← Retour" qui revient à la vue précédente (cas du switch sur un bot déjà connecté). */
  onClose?: () => void;
}) {
  const [provider, setProvider] = useState<'meta' | 'wasender' | null>(null);
  const goBack = () => setProvider(null);

  if (provider) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fournisseur</div>
            <div className="truncate text-sm font-semibold">
              {provider === 'wasender' ? 'WasenderAPI' : 'Meta Cloud API'}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={goBack} className="shrink-0 gap-1.5">
            ← Changer de fournisseur
          </Button>
        </div>
        {provider === 'wasender' ? (
          <WasenderConnectForm storeId={storeId} onConnected={onConnected} onCancel={goBack} />
        ) : (
          <ConnectForm storeId={storeId} onConnected={onConnected} onCancel={goBack} />
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Choisis ton fournisseur WhatsApp</h2>
          <p className="mt-1 text-xs text-muted-foreground">Les deux servent le même bot Claude — seule la couche d'envoi/réception change.</p>
        </div>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="shrink-0 gap-1.5">
            ← Retour
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setProvider('wasender')}
          className="rounded-xl border border-border/60 p-3 text-left transition hover:border-primary hover:bg-primary/5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">WasenderAPI</span>
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">Recommandé</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Scan un QR code, prêt en 1 min. Payant (~6$/mois). WhatsApp Web sous le capot.</p>
        </button>
        <button
          type="button"
          onClick={() => setProvider('meta')}
          className="rounded-xl border border-border/60 p-3 text-left transition hover:border-primary hover:bg-primary/5"
        >
          <div className="text-sm font-semibold">Meta Cloud API</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Officiel, gratuit, nécessite un compte Meta Business + review pour la prod.</p>
        </button>
      </div>
    </section>
  );
}

/**
 * Formulaire de connexion Wasender : le vendeur colle son Personal Access
 * Token. Le backend crée la session (avec webhook URL + secret), puis l'UI
 * affiche le QR à scanner + poll le statut toutes les 3s jusqu'à 'connected'.
 */
function WasenderConnectForm({ storeId, onConnected, mode = 'connect', onCancel }: {
  storeId: string; onConnected: () => void;
  mode?: 'connect' | 'update'; onCancel?: () => void;
}) {
  const isUpdate = mode === 'update';
  const [pat, setPat] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [accountProtection, setAccountProtection] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(false);

  async function connect() {
    setBusy(true); setErr('');
    try {
      const res = await whatsappBotApi.wasenderConnect(storeId, {
        personalAccessToken: pat.trim(),
        phoneNumber: phoneNumber.trim(),
        sessionName: sessionName.trim() || undefined,
        accountProtection,
      });
      if (res.data.status === 'connected') {
        onConnected();
      } else {
        setCreated(true);
      }
    } catch (e) {
      setErr(extractApiError(e, 'Échec de connexion. Vérifie ton Personal Access Token.'));
    } finally { setBusy(false); }
  }

  if (created) {
    return <WasenderQrPanel storeId={storeId} onConnected={onConnected} />;
  }

  return (
    <section className="rounded-2xl border border-dashed border-border/70 bg-card p-6">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
        <QrCode className="h-7 w-7" />
      </div>
      <h2 className="text-center text-base font-semibold">
        {isUpdate ? 'Reconnecter via WasenderAPI' : 'Connecter via WasenderAPI'}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted-foreground">
        Crée un compte sur <a href="https://wasenderapi.com" target="_blank" rel="noopener noreferrer" className="underline">wasenderapi.com</a>,
        génère un <strong>Personal Access Token</strong> (Settings → Personal Access Token), puis colle-le ici.
      </p>
      <div className="mx-auto mt-5 max-w-md space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Personal Access Token</Label>
          <Input value={pat} onChange={(e) => setPat(e.target.value)} placeholder="wsk_..." type="password" className="h-10" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Numéro WhatsApp <span className="text-rose-500">*</span></Label>
          <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+212600000000" className="h-10" />
          <p className="text-[10px] text-muted-foreground">Format international, avec indicatif pays.</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nom de session (optionnel)</Label>
          <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="ex: Boutique principale" className="h-10" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={accountProtection} onChange={(e) => setAccountProtection(e.target.checked)} className="h-4 w-4 rounded border-input" />
          <span>Activer la protection anti-ban (recommandé)</span>
        </label>
        {err && <p className="rounded-md bg-rose-500/5 px-2 py-1.5 text-xs text-rose-700">{err}</p>}
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={busy} className="gap-2">{isUpdate ? 'Annuler' : 'Retour'}</Button>
          )}
          <Button onClick={connect} disabled={busy || !pat.trim() || !phoneNumber.trim()} className="w-full gap-2 gradient-brand text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            {isUpdate ? 'Reconnecter' : 'Créer la session'}
          </Button>
        </div>
        {/* Note dev-only : Wasender refuse les webhooks vers localhost.
            En prod (API_PUBLIC_URL pointe vers api.flexiopage.com) c'est
            inutile à afficher — le backend pré-check de toute façon. */}
        {typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|lvh\.me)$/.test(window.location.hostname) && (
          <p className="text-center text-[11px] text-muted-foreground">
            ⚠️ En dev local : lance <code>ngrok http 5051</code> et mets <code>API_PUBLIC_URL=https://xxxx.ngrok.app</code> dans <code>flexiopage-backend/.env</code> avant de créer la session.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Affiche le QR à scanner + poll le status toutes les 3s. Quand status passe
 * 'connected', appelle onConnected() pour recharger la page parente.
 */
function WasenderQrPanel({ storeId, onConnected }: { storeId: string; onConnected: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<'need_scan' | 'connected' | 'disconnected' | 'unknown'>('need_scan');
  const [err, setErr] = useState('');
  const stopRef = useRef(false);

  const refreshQr = useCallback(async () => {
    try {
      const res = await whatsappBotApi.wasenderQr(storeId);
      setQr(res.data.qr);
      setStatus(res.data.status);
    } catch (e) {
      setErr(extractApiError(e, 'Impossible de récupérer le QR.'));
    }
  }, [storeId]);

  useEffect(() => {
    void refreshQr();
    const id = setInterval(async () => {
      if (stopRef.current) return;
      try {
        const res = await whatsappBotApi.wasenderStatus(storeId);
        setStatus(res.data.status);
        if (res.data.status === 'connected') {
          stopRef.current = true;
          clearInterval(id);
          onConnected();
        } else if (res.data.status === 'need_scan' && !qr) {
          await refreshQr();
        }
      } catch {
        // ignore — on retry au tick suivant
      }
    }, 3000);
    return () => { stopRef.current = true; clearInterval(id); };
  }, [storeId, refreshQr, onConnected, qr]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="text-center">
        <h2 className="text-base font-semibold">Scanne le QR avec ton WhatsApp</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Ouvre WhatsApp → Paramètres → Appareils connectés → Connecter un appareil, puis scanne ce code.
        </p>
      </div>
      {err && <p className="mt-3 text-center text-xs text-rose-600">{err}</p>}
      <div className="mx-auto mt-5 grid place-items-center">
        {qr ? (
          <img src={qrSrc(qr)} alt="QR code WhatsApp"
            className="h-64 w-64 rounded-xl border border-border/60 bg-white p-2" />
        ) : (
          <div className="grid h-64 w-64 place-items-center rounded-xl border border-dashed border-border/60 bg-muted/30">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="mt-4 text-center text-xs text-muted-foreground">
        Statut : <strong>{status === 'connected' ? '✅ Connecté' : status === 'need_scan' ? '⏳ En attente du scan' : status}</strong>
      </div>
      <div className="mt-3 flex justify-center">
        <Button variant="outline" size="sm" onClick={refreshQr} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Rafraîchir le QR
        </Button>
      </div>
    </section>
  );
}

/**
 * Panel debug worker : montre les 10 derniers traitements Claude+Wasender,
 * avec leur étape finale et l'erreur éventuelle. Permet de diagnostiquer
 * pourquoi le bot ne répond pas (Claude vide, send échec, etc) sans logs.
 */
function WasenderWorkerDebug({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof whatsappBotApi.wasenderRecentWorkerRuns>>['data']['items']>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await whatsappBotApi.wasenderRecentWorkerRuns(storeId);
      setItems(res.data.items);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const badgeClass = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-500/10 text-emerald-700';
      case 'empty_reply': return 'bg-amber-500/10 text-amber-800';
      case 'error': return 'bg-rose-500/10 text-rose-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">⚙️ Debug Worker Claude ({items.length})</h2>
          <p className="text-[11px] text-muted-foreground">Les 10 derniers traitements de messages — voir si Claude répond, où ça casse.</p>
        </div>
        <button type="button" onClick={refresh} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <ul className="divide-y divide-border/40">
        {items.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-muted-foreground">
            Aucun traitement de message encore. Envoie un message client puis clique le ↻.
          </li>
        )}
        {items.map((r, i) => (
          <li key={`${r.at}-${i}`}>
            <button
              type="button"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="flex w-full items-center gap-2 px-5 py-2.5 text-left hover:bg-muted/40"
            >
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', badgeClass(r.status))}>
                {r.status}
              </span>
              <code className="text-xs font-mono">{r.step}</code>
              <span className="truncate text-[11px] text-muted-foreground">
                {r.customerText ? `« ${r.customerText.slice(0, 40)} »` : ''}
              </span>
              {r.errorMessage && <span className="text-[11px] text-rose-700">— {r.errorMessage.slice(0, 50)}</span>}
              <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.at).toLocaleTimeString()}</span>
            </button>
            {expandedIdx === i && (
              <div className="space-y-2 bg-muted/30 px-5 py-3 text-[11px]">
                <div><strong>Client :</strong> {r.customerText || '—'}</div>
                <div><strong>Status :</strong> {r.status} · <strong>Step :</strong> {r.step}</div>
                {r.modelUsed && <div><strong>Modèle :</strong> {r.modelUsed}</div>}
                {r.toolsUsed && r.toolsUsed.length > 0 && (
                  <div><strong>Tools utilisés :</strong> {r.toolsUsed.join(', ')}</div>
                )}
                {r.tokensInput !== undefined && (
                  <div><strong>Tokens :</strong> in {r.tokensInput} · out {r.tokensOutput} · ${r.costUsd?.toFixed(5)}</div>
                )}
                {r.replyPreview && (
                  <div><strong>Réponse :</strong> {r.replyPreview}</div>
                )}
                {r.errorMessage && (
                  <div className="rounded-md bg-rose-500/10 px-2 py-1.5 text-rose-700">
                    <strong>Erreur :</strong> {r.errorMessage}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Wasender peut renvoyer le QR sous plusieurs formats :
 *   - Data URI (data:image/png;base64,iVBORw…) → tel quel
 *   - URL absolue (http(s)://…) → tel quel
 *   - Base64 brut (iVBORw…) → préfixer data:image/png;base64,
 *   - Texte UTF-8 raw du QR (1@xxxx,xxx,xxx,xxx==,…) → encoder en SVG via une
 *     image data URI générée côté serveur public (chart-quality URL). On
 *     reste safe avec googleapis chart si le format est inconnu.
 */
function qrSrc(qr: string): string {
  const v = qr.trim();
  if (v.startsWith('data:')) return v;
  if (/^https?:\/\//.test(v)) return v;
  // Base64 PNG/JPEG : commence souvent par iVBOR (PNG) ou /9j/ (JPEG).
  if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 100) return `data:image/png;base64,${v.replace(/\s/g, '')}`;
  // Texte raw du QR (format whatsapp-web "1@…") : on délègue à un service de
  // génération côté client. Repli sûr et offline-ish via api.qrserver.com.
  return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(v)}`;
}

/**
 * Panel debug : affiche les 10 derniers webhooks Wasender reçus côté backend,
 * avec leur état (enqueued / ignored / unsupported / error). Permet de
 * vérifier en prod si Wasender pousse bien les events, et si oui, ce que
 * notre parser en fait — sans avoir besoin d'accès aux logs serveur.
 */
function WasenderWebhookDebug({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof whatsappBotApi.wasenderRecentWebhooks>>['data']['items']>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await whatsappBotApi.wasenderRecentWebhooks(storeId);
      setItems(res.data.items);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const badgeClass = (processed: string) => {
    switch (processed) {
      case 'enqueued': return 'bg-emerald-500/10 text-emerald-700';
      case 'ignored': return 'bg-muted text-muted-foreground';
      case 'session_status': return 'bg-sky-500/10 text-sky-700';
      case 'unsupported': return 'bg-amber-500/10 text-amber-800';
      case 'error': return 'bg-rose-500/10 text-rose-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">🔍 Debug Webhooks Wasender ({items.length})</h2>
          <p className="text-[11px] text-muted-foreground">Les 10 derniers webhooks reçus depuis Wasender. Refresh après un test pour voir ce qui arrive.</p>
        </div>
        <button type="button" onClick={refresh} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <ul className="divide-y divide-border/40">
        {items.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-muted-foreground">
            Aucun webhook reçu encore. Envoie un message depuis un autre numéro vers ta ligne WhatsApp, puis clique le ↻ rafraîchir.
          </li>
        )}
        {items.map((w, i) => (
          <li key={`${w.at}-${i}`}>
            <button
              type="button"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="flex w-full items-center gap-2 px-5 py-2.5 text-left hover:bg-muted/40"
            >
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', badgeClass(w.processed))}>
                {w.processed}
              </span>
              <code className="text-xs font-mono">{w.event || '—'}</code>
              {w.reason && <span className="text-[11px] text-muted-foreground">— {w.reason}</span>}
              <span className="ml-auto text-[10px] text-muted-foreground">{new Date(w.at).toLocaleTimeString()}</span>
            </button>
            {expandedIdx === i && (
              <pre className="overflow-x-auto bg-muted/30 px-5 py-3 text-[10px] leading-tight">
                {JSON.stringify(w.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bandeau de statut pour une session Wasender existante mais pas active. */
function WasenderSessionStatus({ storeId, onConnected }: { storeId: string; onConnected: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
        <AlertTriangle className="h-4 w-4" /> Session Wasender en pause — scanne le QR pour réactiver
      </div>
      <WasenderQrPanel storeId={storeId} onConnected={onConnected} />
    </div>
  );
}
