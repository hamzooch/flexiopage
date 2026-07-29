'use client';

/**
 * Marketing toolkit index — la boîte à outils du marketing/growth de
 * FlexioPage. Regroupe :
 *   - Le reel auto-scroll pour Facebook / TikTok / Reels
 *   - Les URL des écrans à screenshot (dashboard demo, storefront, checkout)
 *   - Les textes overlay prêts-à-coller pour la pub
 *   - Les credentials du compte démo à utiliser pour les captures
 *
 * Volontairement pas dans /admin — permet à un partenaire growth
 * externe d'accéder à la toolkit sans compte admin.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Film, Camera, Type, Copy, Check, ExternalLink, Sparkles, Smartphone,
  ShoppingBag, LayoutDashboard, Users, TrendingUp, Play,
} from 'lucide-react';

const DEMO_STORE_SLUG = 'digital-business-pro';
const DEMO_EMAIL = 'demo-vendor@flexiopage.dev';
const DEMO_PASSWORD = 'Demo2026!';

export default function MarketingToolkitPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-background to-orange-50/30 dark:from-fuchsia-950/10 dark:via-background dark:to-orange-950/10">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <div className="mb-10 flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-orange-500 text-white shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Marketing Toolkit</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reel publicitaire, écrans à screenshot, textes overlay, credentials démo — tout ce qu'il faut pour lancer une campagne Facebook / TikTok / Instagram Ads.
            </p>
          </div>
        </div>

        {/* Section 1 — Video Reel */}
        <Section title="1. Vidéo publicitaire 15s" icon={Film}>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm text-muted-foreground">
                Reel cinématique 9:16 avec 5 shots scriptés (intro, notif push, KPIs revenu, méthodes payment, CTA). Enregistre-le sur ton téléphone en portrait, puis monte-le dans <a href="https://www.capcut.com/" className="text-primary underline" target="_blank" rel="noreferrer">CapCut</a> pour ajouter musique + voix off.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/marketing/reel"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02]"
                >
                  <Play className="h-4 w-4" />
                  Ouvrir le reel
                </Link>
                <CopyBtn value={typeof window !== 'undefined' ? `${window.location.origin}/marketing/reel` : '/marketing/reel'} label="Copier l'URL" />
              </div>
            </div>
            <div className="relative aspect-[9/16] w-40 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-500 via-orange-500 to-rose-600 shadow-2xl">
              <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center text-white">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-lg font-black">F</div>
                <div className="mt-2 text-xs font-black leading-tight">Ta boutique digitale qui vend pendant que tu dors</div>
              </div>
            </div>
          </div>
        </Section>

        {/* Section 2 — Compte demo */}
        <Section title="2. Compte démo pour les captures" icon={Users}>
          <p className="mb-4 text-sm text-muted-foreground">
            Connecte-toi avec ces credentials → tu accèdes à un vendeur qui a 480 ventes, 4,8M FCFA de revenu sur 30 jours, et une boutique éditoriale prête à screenshot.
          </p>
          <div className="grid gap-2 rounded-xl border border-border/60 bg-card p-4 sm:grid-cols-2">
            <CredRow label="Email" value={DEMO_EMAIL} />
            <CredRow label="Password" value={DEMO_PASSWORD} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            💡 Si les données paraissent vides, l'admin doit lancer <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">npm run seed:demo-marketing</code> depuis le container backend sur le VPS.
          </p>
        </Section>

        {/* Section 3 — Écrans à screenshot */}
        <Section title="3. Écrans à screenshot" icon={Camera}>
          <p className="mb-4 text-sm text-muted-foreground">
            Connecte-toi avec le compte démo puis va sur chacun de ces écrans. Prends-en une capture propre pour ta landing / Facebook Ads.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScreenCard
              icon={LayoutDashboard}
              tone="from-emerald-500 to-teal-600"
              title="Dashboard vendeur"
              href="/dashboard"
              hint="Revenus + graph + top produits"
            />
            <ScreenCard
              icon={TrendingUp}
              tone="from-blue-500 to-indigo-600"
              title="Analytics"
              href="/dashboard/analytics"
              hint="Courbes 30j — croissance visible"
            />
            <ScreenCard
              icon={ShoppingBag}
              tone="from-fuchsia-500 to-rose-600"
              title="Storefront produit"
              href={`/store/${DEMO_STORE_SLUG}/product/formation-dropshipping-ci-2026`}
              hint="Design côté acheteur"
            />
            <ScreenCard
              icon={Smartphone}
              tone="from-orange-500 to-amber-600"
              title="Checkout Mobile Money"
              href={`/store/${DEMO_STORE_SLUG}/checkout/formation-dropshipping-ci-2026`}
              hint="Wave / OM / MTN visibles"
            />
          </div>
        </Section>

        {/* Section 4 — Copy overlay */}
        <Section title="4. Textes overlay pour Facebook Ads" icon={Type}>
          <p className="mb-4 text-sm text-muted-foreground">
            Copie ces textes et ajoute-les dans CapCut ou Canva par-dessus tes captures. Chaque bloc = une capture différente.
          </p>
          <div className="space-y-3">
            <OverlayBlock
              screen="Dashboard"
              hook="4,8 MILLIONS FCFA en 30 jours →"
              body="Voici comment j'ai fait avec FlexioPage"
              cta="👉 flexiopage.com"
            />
            <OverlayBlock
              screen="Storefront produit"
              hook="Ma boutique digitale gère tout"
              body="→ Vendre pendant que je dors"
              cta="👉 flexiopage.com"
            />
            <OverlayBlock
              screen="Checkout Mobile Money"
              hook="Un checkout qui convertit"
              body="Wave · Orange Money · MTN · Moov — tout en 1 clic"
              cta="👉 flexiopage.com"
            />
            <OverlayBlock
              screen="Notification push"
              hook="🔔 +14 990 FCFA"
              body="Chaque notif = une vente qui arrive"
              cta="👉 flexiopage.com"
            />
          </div>
        </Section>

        {/* Section 5 — Ad script */}
        <Section title="5. Script voix-off (15-30s)" icon={Type}>
          <p className="mb-3 text-sm text-muted-foreground">
            Enregistre-toi ou utilise la voix IA de CapCut. En français, ton dynamique, débit rapide.
          </p>
          <CopyBlock
            text={`Tu veux gagner de l'argent en ligne au Sénégal, en Côte d'Ivoire, au Mali ?

FlexioPage te permet de créer ta boutique digitale gratuitement en 3 minutes.

Wave, Orange Money, MTN, Moov — tout est intégré.

Formations, e-books, templates : vends ce que tu veux, à qui tu veux, quand tu dors.

Lance-toi maintenant sur flexiopage.com.`}
          />
        </Section>

        {/* Section 6 — Recommandations */}
        <Section title="6. Best practices Facebook / TikTok" icon={Sparkles}>
          <ul className="space-y-2 text-sm">
            <BestPractice>Format vertical <strong>9:16</strong> (déjà géré par le reel)</BestPractice>
            <BestPractice><strong>Sous-titres brûlés</strong> — 85% des vidéos FB sont regardées sans son</BestPractice>
            <BestPractice><strong>Musique upbeat</strong> — +40% d'engagement en moyenne</BestPractice>
            <BestPractice>CTA final visible <strong>≥ 3 secondes</strong></BestPractice>
            <BestPractice>Publie 2 versions (15s + 30s) — le 30s est un loop du 15s</BestPractice>
            <BestPractice><strong>Test A/B des hooks</strong> — même vidéo, 2 accroches différentes en overlay</BestPractice>
            <BestPractice><strong>Ciblage FB Ads</strong> : Sénégal, Côte d'Ivoire, Mali, Burkina, Bénin, Togo · 18-45 ans · intérêts : e-commerce, dropshipping, business en ligne, Wave, Orange Money</BestPractice>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-fuchsia-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ScreenCard({ icon: Icon, tone, title, href, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  href: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <ExternalLink className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{href}</div>
      </div>
    </a>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label} :</span>
      <code className="rounded bg-muted px-2 py-0.5 text-xs">{value}</code>
      <CopyBtn value={value} />
    </div>
  );
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

function OverlayBlock({ screen, hook, body, cta }: {
  screen: string;
  hook: string;
  body: string;
  cta: string;
}) {
  const combined = `${hook}\n${body}\n${cta}`;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          {screen}
        </span>
        <CopyBtn value={combined} label="Copier" />
      </div>
      <div className="space-y-1 text-sm">
        <div className="font-black">{hook}</div>
        <div className="text-muted-foreground">{body}</div>
        <div className="text-xs font-semibold text-primary">{cta}</div>
      </div>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="relative rounded-xl border border-border/60 bg-muted/30 p-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{text}</pre>
      <div className="mt-3 flex justify-end">
        <CopyBtn value={text} label="Copier le script" />
      </div>
    </div>
  );
}

function BestPractice({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span className="text-sm">{children}</span>
    </li>
  );
}
