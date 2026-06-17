'use client';

/**
 * Paramètres globaux du compte (différent du profil) :
 *   • Préférences interface — langue, mode foncé (placeholder)
 *   • Notifications — flags simples persistés en localStorage
 *   • Modèle de tarification — info commission + lien wallet
 *   • Zone dangereuse — déconnexion partout (pour l'instant)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Bell,
  Wallet,
  ShieldAlert,
  LogOut,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react';

const PREF_KEY = 'flexiopage:prefs';

type Prefs = {
  language: 'fr' | 'ar' | 'en';
  notifyOrders: boolean;
  notifyMarketing: boolean;
  notifyWallet: boolean;
};

const DEFAULT_PREFS: Prefs = {
  language: 'fr',
  notifyOrders: true,
  notifyMarketing: false,
  notifyWallet: true,
};

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function handleLogout() {
    logout();
    router.replace('/');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">Préférences de l&apos;interface, notifications et compte.</p>
      </div>

      {/* Locale & langue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> Langue</CardTitle>
          <CardDescription>Choisis la langue de l&apos;interface du dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { value: 'fr', label: 'Français', sub: 'Recommandé' },
              { value: 'ar', label: 'العربية', sub: 'RTL' },
              { value: 'en', label: 'English', sub: 'Beta' },
            ] as const).map((opt) => {
              const active = prefs.language === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('language', opt.value)}
                  className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                    active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="text-base font-semibold">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{opt.sub}</div>
                  {active && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {saved && <p className="mt-3 text-xs text-emerald-600">Préférence enregistrée localement.</p>}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</CardTitle>
          <CardDescription>Choisis ce que tu veux recevoir par email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            label="Nouvelles commandes"
            sublabel="On t'envoie un email à chaque nouvelle commande."
            checked={prefs.notifyOrders}
            onChange={(v) => update('notifyOrders', v)}
          />
          <ToggleRow
            label="Mouvements de solde"
            sublabel="Top-up, commission débitée, refund."
            checked={prefs.notifyWallet}
            onChange={(v) => update('notifyWallet', v)}
          />
          <ToggleRow
            label="Conseils & nouveautés"
            sublabel="Nouvelles fonctionnalités, astuces marketing."
            checked={prefs.notifyMarketing}
            onChange={(v) => update('notifyMarketing', v)}
          />
        </CardContent>
      </Card>

      {/* Tarification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Modèle de tarification</CardTitle>
          <CardDescription>0 € d&apos;abonnement. Tu paies uniquement par commande livrée.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FactPill icon={<Wallet className="h-4 w-4 text-emerald-600" />} title="Commission 3%" desc="Sur chaque commande livrée, plafonnée à 1 500 F CFA." />
            <FactPill icon={<Sparkles className="h-4 w-4 text-fuchsia-600" />} title="Génération AI" desc="Landing page / page produit ≈ 500 par génération." />
          </div>
          <Link
            href="/dashboard/wallet"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Aller au solde
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-4 w-4" /> Zone dangereuse</CardTitle>
          <CardDescription>Actions sensibles sur le compte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold">Se déconnecter</div>
              <div className="text-xs text-muted-foreground">Tu seras redirigé vers la page d&apos;accueil. Ton compte reste intact.</div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Connecté en tant que <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/30">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function FactPill({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
