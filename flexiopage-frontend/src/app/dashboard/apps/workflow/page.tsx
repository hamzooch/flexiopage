'use client';

/**
 * Application Workflow — scénario « finaliser la commande ».
 * Les boutiques digitales relancent par email un paiement abandonné.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GitBranch, Loader2, Mail, Save } from 'lucide-react';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/page-header';
import { BrandLogo } from '@/components/dashboard/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Run = {
  id: string;
  orderNumber: string;
  step: 1 | 2;
  status: 'sent' | 'failed';
  recovered: boolean;
  to: string;
  error: string | null;
  sentAt: string;
};

const SAMPLE = {
  firstName: ' Amina',
  product: 'Caftan',
  amount: '45 000 F CFA',
  link: 'https://…/payer',
  storeName: 'ta boutique',
};

function preview(template: string): string {
  return template.replace(/\{\{\s*(firstName|product|amount|link|storeName)\s*\}\}/g, (_, key: keyof typeof SAMPLE) => SAMPLE[key] ?? '');
}

export default function WorkflowAppPage() {
  const searchParams = useSearchParams();
  const { storeId } = useScopedStoreId(searchParams.get('storeId'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digital, setDigital] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [firstDelay, setFirstDelay] = useState(20);
  const [secondEnabled, setSecondEnabled] = useState(true);
  const [secondDelay, setSecondDelay] = useState(24);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await storesApi.getWorkflow(storeId);
      const cfg = res.data.workflow;
      setDigital(cfg.storeType === 'digital');
      setEnabled(cfg.enabled);
      setFirstDelay(cfg.abandonedCheckout.firstDelayMinutes);
      setSecondEnabled(cfg.abandonedCheckout.secondEnabled);
      setSecondDelay(cfg.abandonedCheckout.secondDelayHours);
      setSubject(cfg.abandonedCheckout.subject);
      setBody(cfg.abandonedCheckout.body);
      setRuns(res.data.runs);
    } catch {
      setError('Impossible de charger Workflow.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!storeId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await storesApi.saveWorkflow(storeId, {
        enabled: digital && enabled,
        firstDelayMinutes: firstDelay,
        secondEnabled,
        secondDelayHours: secondDelay,
        subject,
        body,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (!storeId || loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        icon={GitBranch}
        title="Workflow"
        description="Scénarios automatiques pour cette boutique."
      />

      <section className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <BrandLogo src="/brands/workflow.svg" className="h-12 w-12 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Finaliser la commande</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Quand un client d’une boutique digitale commence un paiement et ne le termine pas,
              il reçoit un email avec le produit, le montant et un lien pour payer.
              Un second email part le lendemain si la commande est toujours en attente.
            </p>
          </div>
        </div>

        {!digital && (
          <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
            Ce scénario concerne les boutiques digitales. Cette boutique est physique, il reste inactif.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Scénario actif</div>
            <p className="text-xs text-muted-foreground">Seules les commandes créées après l’activation sont relancées.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!digital}
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40',
              enabled && digital ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', enabled && digital ? 'translate-x-[22px]' : 'translate-x-0.5')} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="wf-delay">Premier email après l’abandon</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="wf-delay"
                type="number"
                min={5}
                max={240}
                value={firstDelay}
                onChange={(e) => setFirstDelay(Number(e.target.value))}
                className="h-11"
              />
              <span className="shrink-0 text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">La commande est d’abord marquée abandonnée au bout de 15 minutes.</p>
          </div>
          <div>
            <Label htmlFor="wf-second">Rappel</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="wf-second"
                type="checkbox"
                checked={secondEnabled}
                onChange={(e) => setSecondEnabled(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Input
                type="number"
                min={1}
                max={72}
                disabled={!secondEnabled}
                value={secondDelay}
                onChange={(e) => setSecondDelay(Number(e.target.value))}
                className="h-11"
                aria-label="Délai du rappel en heures"
              />
              <span className="shrink-0 text-sm text-muted-foreground">heures</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="wf-subject">Objet</Label>
          <Input id="wf-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5 h-11" maxLength={140} />
          <p className="mt-1 truncate text-xs text-muted-foreground">Aperçu : {preview(subject)}</p>
        </div>

        <div className="mt-4">
          <Label htmlFor="wf-body">Message</Label>
          <textarea
            id="wf-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={2000}
            className="mt-1.5 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Champs : {'{{firstName}}'} {'{{product}}'} {'{{amount}}'} {'{{link}}'} {'{{storeName}}'}
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">{error}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={saving} className="h-11 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
          {saved && <span className="text-sm font-medium text-emerald-700">Enregistré</span>}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-primary" />
          Journal
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucun email envoyé pour le moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {run.orderNumber}
                    <span className="ml-2 font-normal text-muted-foreground">{run.step === 1 ? 'Premier email' : 'Rappel'}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{run.to} · {formatDate(run.sentAt)}</div>
                  {run.error && run.status === 'failed' && (
                    <div className="mt-0.5 text-xs text-rose-700">{run.error}</div>
                  )}
                </div>
                <span className={cn(
                  'w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
                  run.recovered
                    ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
                    : run.status === 'sent'
                      ? 'bg-sky-500/10 text-sky-800 ring-sky-500/20'
                      : 'bg-rose-500/10 text-rose-700 ring-rose-500/20',
                )}>
                  {run.recovered ? 'Payée ensuite' : run.status === 'sent' ? 'Envoyé' : 'Échec'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
