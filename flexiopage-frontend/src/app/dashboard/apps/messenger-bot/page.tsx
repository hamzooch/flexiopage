'use client';

/**
 * Page de gestion du Messenger Bot pour une boutique.
 * Flux : connexion page Facebook (OAuth) → configuration → test → inbox + stats.
 * Le storeId vient de ?storeId= (ou de la boutique active).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot, Loader2, Plug, Check, Send, MessageSquare, RefreshCw, Power, AlertTriangle, Sparkles,
} from 'lucide-react';
import { messengerBotApi, extractApiError, type MessengerBotConfig, type FbPageOption, type MessengerConversation, type MessengerMessage } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Overview = Awaited<ReturnType<typeof messengerBotApi.statsOverview>>['data'];

export default function MessengerBotPage() {
  const router = useRouter();
  const params = useSearchParams();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const storeId = params.get('storeId') || currentStoreId || '';
  const oauthCode = params.get('code');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<MessengerBotConfig | null>(null);
  const [pages, setPages] = useState<FbPageOption[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await messengerBotApi.getConfig(storeId);
      setConfig(res.data.config);
      if (res.data.connected) {
        const ov = await messengerBotApi.statsOverview(storeId).catch(() => null);
        setOverview(ov?.data || null);
      }
    } catch (err) {
      setError(extractApiError(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Retour OAuth : ?code présent → échange contre la liste des pages.
  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    if (oauthCode) {
      setLoading(true);
      messengerBotApi.oauthCallback(storeId, oauthCode)
        .then((res) => setPages(res.data.pages))
        .catch((err) => setError(extractApiError(err, 'Échec OAuth Facebook.')))
        .finally(() => {
          setLoading(false);
          // Nettoie le code de l'URL.
          router.replace(`/dashboard/apps/messenger-bot?storeId=${storeId}`);
        });
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, oauthCode]);

  async function startConnect() {
    setBusy(true); setError('');
    try {
      const res = await messengerBotApi.getAuthUrl(storeId);
      window.location.href = res.data.url;
    } catch (err) {
      setError(extractApiError(err, 'Impossible de démarrer la connexion Facebook.'));
      setBusy(false);
    }
  }

  async function pickPage(p: FbPageOption) {
    setBusy(true); setError('');
    try {
      await messengerBotApi.connectPage(storeId, {
        pageId: p.id, pageAccessToken: p.access_token, pageName: p.name, pagePictureUrl: p.picture_url,
      });
      setPages(null);
      await load();
    } catch (err) {
      setError(extractApiError(err, 'Connexion de la page échouée.'));
    } finally {
      setBusy(false);
    }
  }

  if (!storeId) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sélectionne une boutique d'abord.</div>;
  }
  if (loading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bot}
        title="Messenger Bot"
        description="Chatbot IA darija/français qui répond aux clients et crée les commandes COD depuis ta page Facebook."
        actions={config?.status === 'active' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3 w-3" strokeWidth={3} /> Connecté
          </span>
        ) : undefined}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Choix de page après OAuth */}
      {pages && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Choisis la page à connecter</h2>
          {pages.length === 0 && <p className="text-sm text-muted-foreground">Aucune page trouvée sur ce compte Facebook.</p>}
          <div className="grid gap-2">
            {pages.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => pickPage(p)}
                className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left hover:border-primary/40 hover:bg-muted/40 disabled:opacity-60">
                {p.picture_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.picture_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  : <span className="grid h-9 w-9 place-items-center rounded-full bg-muted"><MessageSquare className="h-4 w-4" /></span>}
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <Plug className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Non connecté */}
      {!pages && !config && (
        <section className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold">Connecte ta page Facebook</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Le bot répondra automatiquement aux messages de ta page et créera les commandes dans Flexiopage.
          </p>
          <Button onClick={startConnect} disabled={busy} className="mt-5 gap-2 gradient-brand text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Connecter Facebook
          </Button>
        </section>
      )}

      {/* Connecté : config + test + inbox + stats */}
      {!pages && config && (
        <>
          {overview && <StatsRow overview={overview} />}
          <div className="grid gap-6 lg:grid-cols-2">
            <ConfigForm storeId={storeId} config={config} onSaved={load} />
            <TestBox storeId={storeId} />
          </div>
          <Inbox storeId={storeId} />
          <div>
            <Button variant="outline" size="sm" className="gap-1.5 text-rose-600"
              onClick={async () => { if (confirm('Déconnecter la page ?')) { await messengerBotApi.disconnect(storeId); await load(); } }}>
              <Power className="h-3.5 w-3.5" /> Déconnecter la page
            </Button>
          </div>
        </>
      )}
    </div>
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
    try {
      await messengerBotApi.updateConfig(storeId, form);
      setMsg('Enregistré ✅'); onSaved();
    } catch (err) {
      setMsg(extractApiError(err, 'Échec.'));
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
      <h2 className="text-sm font-semibold">Configuration</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Langue">
          <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as MessengerBotConfig['language'] })}>
            <option value="darija_ma">Darija 🇲🇦</option><option value="darija_dz">Darija 🇩🇿</option>
            <option value="darija_tn">Derja 🇹🇳</option><option value="ar">Arabe</option><option value="fr">Français</option>
          </select>
        </Field>
        <Field label="Pays">
          <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value as MessengerBotConfig['country'] })}>
            <option value="MA">Maroc</option><option value="DZ">Algérie</option><option value="TN">Tunisie</option>
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
      const res = await messengerBotApi.testBot(storeId, input);
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
    messengerBotApi.listConversations(storeId, { limit: 30 })
      .then((res) => setConvs(res.data.conversations)).catch(() => setConvs([])).finally(() => setLoading(false));
  }, [storeId]);
  useEffect(() => { refresh(); }, [refresh]);

  async function open(id: string) {
    setSel(id);
    const res = await messengerBotApi.getConversation(storeId, id);
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
                  <span className="truncate text-sm font-medium">{c.customer_name || c.customer_psid.slice(0, 8)}</span>
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
