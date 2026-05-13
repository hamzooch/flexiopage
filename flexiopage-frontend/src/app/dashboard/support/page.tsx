'use client';

/**
 * Support — seller-side complaints (réclamations).
 *   • Form to open a new ticket
 *   • List of own tickets with status pills, click to view thread
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { complaintsApi, type MyComplaint, type ComplaintCategory, type ComplaintStatus } from '@/lib/api';
import {
  LifeBuoy, Loader2, Send, Plus, ChevronRight, AlertCircle, Clock, Check, X as XIcon,
} from 'lucide-react';

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'order',    label: 'Commande' },
  { value: 'payment',  label: 'Paiement' },
  { value: 'wallet',   label: 'Wallet / Solde' },
  { value: 'delivery', label: 'Livraison' },
  { value: 'account',  label: 'Compte' },
  { value: 'other',    label: 'Autre' },
];

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  resolved: 'Résolue',
  closed: 'Fermée',
};

export default function SellerSupportPage() {
  const [list, setList] = useState<MyComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('other');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await complaintsApi.list();
      setList(res.data.complaints);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (subject.trim().length < 3 || message.trim().length < 5) {
      setError('Sujet (3 chars min) et message (5 chars min) requis.');
      return;
    }
    setSubmitting(true);
    try {
      await complaintsApi.create({ subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage(''); setCategory('other'); setCreating(false);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Erreur lors de l\'envoi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <LifeBuoy className="h-7 w-7 text-fuchsia-500" />
            Support
          </h1>
          <p className="text-muted-foreground">Ouvre une réclamation et suis sa résolution avec l&apos;équipe FlexioPage.</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} className="gap-1.5 gradient-brand">
            <Plus className="h-4 w-4" />
            Nouvelle réclamation
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Décris ton problème</CardTitle>
            <CardDescription>Précise au maximum pour qu&apos;on puisse t&apos;aider rapidement.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="subject" className="text-xs">Sujet</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Commande livrée mais paiement non reçu"
                  className="mt-1"
                  required
                  minLength={3}
                />
              </div>
              <div>
                <Label className="text-xs">Catégorie</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        category === c.value
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                          : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="message" className="text-xs">Message</Label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 min-h-[140px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                  placeholder="Ex: La commande ORD-1023 a été marquée livrée, mais aucun crédit n'apparaît sur mon solde principal. Le client a confirmé avoir payé en espèces au livreur."
                  required
                  minLength={5}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>Annuler</Button>
                <Button type="submit" disabled={submitting} className="gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List of my tickets */}
      <Card>
        <CardHeader>
          <CardTitle>Mes réclamations ({list.length})</CardTitle>
          <CardDescription>Clique sur un ticket pour voir la conversation et répondre.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
              <LifeBuoy className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">Aucune réclamation ouverte.</p>
              <p className="mt-1 text-xs text-muted-foreground">Tout va bien ? Sinon, ouvre un ticket — on répond sous 24h.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <li key={c._id}>
                  <Link href={`/dashboard/support/${c._id}`} className="group flex items-start gap-3 py-3 hover:bg-muted/30">
                    <StatusIcon status={c.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{c.subject}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{CATEGORIES.find((x) => x.value === c.category)?.label || c.category}</span>
                        <span>· {c.messages.length} message(s)</span>
                        <span>· Mis à jour {new Date(c.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(c.status)}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                    <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusIcon({ status }: { status: ComplaintStatus }) {
  const m = {
    open: { Icon: AlertCircle, cls: 'bg-rose-500/10 text-rose-600' },
    in_progress: { Icon: Clock, cls: 'bg-amber-500/10 text-amber-600' },
    resolved: { Icon: Check, cls: 'bg-emerald-500/10 text-emerald-600' },
    closed: { Icon: XIcon, cls: 'bg-muted text-muted-foreground' },
  }[status];
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${m.cls}`}>
      <m.Icon className="h-4 w-4" />
    </span>
  );
}

function statusColor(s: ComplaintStatus): string {
  return {
    open: 'bg-rose-500/10 text-rose-700',
    in_progress: 'bg-amber-500/10 text-amber-700',
    resolved: 'bg-emerald-500/10 text-emerald-700',
    closed: 'bg-muted text-muted-foreground',
  }[s];
}
