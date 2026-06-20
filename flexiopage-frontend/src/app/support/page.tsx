'use client';

/**
 * Page publique /support — formulaire de contact accessible sans auth.
 *
 * Envoie le message à support@flexiopage.com via POST /api/public/support.
 * Sert prospects, vendeurs non-connectés, journalistes, etc. Pas le système
 * de tickets vendeur (qui vit derrière l'auth à /dashboard/support).
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Mail, Send, Check, Loader2, AlertCircle, MessageSquare, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/brand-logo';
import { supportApi, type SupportCategory } from '@/lib/api';

const SUPPORT_EMAIL = 'support@flexiopage.com';

const CATEGORIES: { value: SupportCategory; label: string; hint: string }[] = [
  { value: 'general',     label: 'Question générale', hint: 'Renseignement sur la plateforme.' },
  { value: 'sales',       label: 'Avant-vente',       hint: 'Tarif, fonctionnalités, démo.' },
  { value: 'technical',   label: 'Aide technique',    hint: 'Configuration, intégrations, domaine.' },
  { value: 'billing',     label: 'Facturation',       hint: 'Solde, commission, recharge AI.' },
  { value: 'bug-report',  label: 'Bug à signaler',    hint: 'Quelque chose ne fonctionne pas.' },
  { value: 'partnership', label: 'Partenariat',       hint: 'Intégration, revente, presse.' },
];

export default function SupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<SupportCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot — caché en CSS, rempli par les bots et signalé côté serveur.
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2)    { setError('Indique ton nom (au moins 2 caractères).'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }
    if (subject.trim().length < 3) { setError('Sujet trop court (au moins 3 caractères).'); return; }
    if (message.trim().length < 10){ setError('Message trop court (au moins 10 caractères).'); return; }
    setSubmitting(true);
    try {
      await supportApi.submit({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        category,
        website: website.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || `Impossible d'envoyer le message. Écris-nous directement à ${SUPPORT_EMAIL}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-violet-500/5">
      {/* Header simple : logo + retour accueil */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <BrandLogo variant="color" width={120} />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Intro */}
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-700">
            <MessageSquare className="h-3 w-3" />
            Support
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Comment peut-on t&apos;aider ?</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Une question, un bug, une idée ? Écris-nous via le formulaire ci-dessous ou directement à{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            . Réponse en général sous 24h ouvrées.
          </p>
        </div>

        {/* Form / Success */}
        {success ? (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-700">
              <Check className="h-6 w-6" strokeWidth={3} />
            </div>
            <h2 className="text-xl font-bold">Message envoyé</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              On a bien reçu ton message. Tu recevras une réponse à <strong>{email}</strong> dès qu&apos;un membre de
              l&apos;équipe revient vers toi (généralement sous 24h ouvrées).
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(false);
                  setSubject('');
                  setMessage('');
                }}
              >
                Envoyer un autre message
              </Button>
              <Link href="/">
                <Button>Retour à l&apos;accueil</Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-5 rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-8">
            {/* Honeypot — caché des humains, visible des bots */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
              <label htmlFor="website">Site web (laisse vide)</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Ton nom</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Hamza Teyeb"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@exemple.com"
                  autoComplete="email"
                  required
                />
                <p className="text-[11px] text-muted-foreground">On répond à cette adresse.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      category === cat.value
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border/60 hover:border-primary/30 hover:bg-muted/30'
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        category === cat.value ? 'border-primary bg-primary' : 'border-border'
                      }`}
                    >
                      {category === cat.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{cat.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{cat.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Sujet</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Problème de connexion Google"
                required
                maxLength={140}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Décris ta question ou ton problème — plus tu donnes de contexte, plus la réponse est précise."
                required
                minLength={10}
                maxLength={5000}
                className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {message.length}/5000 caractères
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
                ou écris directement à <span className="font-semibold">{SUPPORT_EMAIL}</span>
              </a>
              <Button type="submit" disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Envoi…' : 'Envoyer le message'}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
