'use client';

/**
 * Éditeurs des sections "conversion" de la page produit publique.
 * Centralisés dans un seul fichier pour ne pas éclater l'éditeur produit
 * principal, et réutilisables par d'autres surfaces (wizard produit, etc.).
 *
 * Sections gérées :
 *   - Features (USPs) : icône + titre + sous-titre
 *   - FAQ : question / réponse
 *   - Specs : tableau clé / valeur
 *   - Shipping & retours : délai, frais, fenêtre de retour
 */

import { useState } from 'react';
import {
  Plus, Trash2, GripVertical, Wand2, ChevronDown,
  Sparkles, Shield, Leaf, Zap, Heart, Award, Gift, Truck, Clock, Check, Star, Recycle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ─── Types (mirrors backend IProductPageSettings) ───────────────────
export type FeatureIcon =
  | 'sparkles' | 'shield' | 'leaf' | 'zap' | 'heart' | 'award'
  | 'gift' | 'truck' | 'clock' | 'check' | 'star' | 'recycle';

export interface ProductFeature {
  icon: FeatureIcon;
  title: string;
  subtitle?: string;
}

export interface ProductFaqItem {
  question: string;
  answer: string;
}

export interface ProductSpecItem {
  key: string;
  value: string;
}

export interface ProductShippingInfo {
  deliveryTime?: string;
  deliveryNote?: string;
  returnDays?: number;
  returnNote?: string;
}

export interface ProductVideo {
  url: string;
  title?: string;
}

export interface ProductComparisonRow {
  criterion: string;
  us: string;
  them: string;
}

export interface ProductComparison {
  title?: string;
  usLabel?: string;
  themLabel?: string;
  rows: ProductComparisonRow[];
}

// ─── Templates par niche — données curées pour Features / FAQ / Specs ──
export type TemplateNiche = 'fashion' | 'cosmetic' | 'home' | 'tech' | 'food' | 'wellness';
const TEMPLATE_NICHES: { id: TemplateNiche; label: string }[] = [
  { id: 'fashion',  label: 'Mode' },
  { id: 'cosmetic', label: 'Cosmétique' },
  { id: 'home',     label: 'Déco / maison' },
  { id: 'tech',     label: 'Tech / accessoires' },
  { id: 'food',     label: 'Alimentaire' },
  { id: 'wellness', label: 'Bien-être' },
];

const FEATURE_TEMPLATES: Record<TemplateNiche, ProductFeature[]> = {
  fashion: [
    { icon: 'leaf',     title: 'Matière premium',          subtitle: '100 % coton bio certifié' },
    { icon: 'shield',   title: 'Coutures renforcées',      subtitle: 'Tient au-delà de 30 lavages' },
    { icon: 'star',     title: 'Coupe ajustée',            subtitle: 'Testée sur 3 morphologies' },
    { icon: 'truck',    title: 'Livraison express',        subtitle: 'À ta porte en 48h' },
  ],
  cosmetic: [
    { icon: 'leaf',     title: 'Composition clean',        subtitle: 'Sans paraben, sulfate, ni silicone' },
    { icon: 'heart',    title: 'Testé dermatologiquement', subtitle: 'Convient aux peaux sensibles' },
    { icon: 'sparkles', title: 'Résultats visibles',       subtitle: 'Dès 7 jours d’utilisation' },
    { icon: 'recycle',  title: 'Packaging recyclé',        subtitle: '85 % de plastique recyclé' },
  ],
  home: [
    { icon: 'award',    title: 'Finition premium',         subtitle: 'Assemblé à la main' },
    { icon: 'leaf',     title: 'Bois durable',             subtitle: 'Provenance certifiée FSC' },
    { icon: 'shield',   title: 'Garantie 2 ans',           subtitle: 'Pièces remplacées sans frais' },
    { icon: 'truck',    title: 'Livraison sécurisée',      subtitle: 'Emballage anti-choc' },
  ],
  tech: [
    { icon: 'zap',      title: 'Charge rapide',            subtitle: '0 → 80 % en 30 min' },
    { icon: 'shield',   title: 'Garantie constructeur',    subtitle: '12 mois, retour gratuit' },
    { icon: 'check',    title: 'Compatible universel',     subtitle: 'iPhone, Android, USB-C' },
    { icon: 'star',     title: 'Note moyenne 4.8/5',       subtitle: 'Plus de 500 avis vérifiés' },
  ],
  food: [
    { icon: 'leaf',     title: '100 % naturel',            subtitle: 'Aucun conservateur ajouté' },
    { icon: 'award',    title: 'Origine artisanale',       subtitle: 'Fabriqué dans nos ateliers' },
    { icon: 'clock',    title: 'Fraîcheur garantie',       subtitle: 'Conservation 6 mois' },
    { icon: 'gift',     title: 'Idéal cadeau',             subtitle: 'Emballage soigné inclus' },
  ],
  wellness: [
    { icon: 'heart',    title: 'Recommandé par les coachs', subtitle: 'Approuvé par 200+ pros' },
    { icon: 'leaf',     title: 'Ingrédients d’origine naturelle', subtitle: 'Traçabilité totale' },
    { icon: 'award',    title: 'Norme ISO 22000',          subtitle: 'Qualité contrôlée' },
    { icon: 'clock',    title: 'Effet en 14 jours',        subtitle: 'Cure recommandée' },
  ],
};

const FAQ_TEMPLATES: Record<TemplateNiche, ProductFaqItem[]> = {
  fashion: [
    { question: 'Comment choisir ma taille ?', answer: 'Le guide des tailles est intégré sur la fiche. En cas de doute entre deux tailles, prends celle au-dessus — la coupe est ajustée.' },
    { question: 'Puis-je échanger ou retourner ?', answer: 'Oui, échange ou remboursement sous 14 jours après réception. Article non porté, étiquette présente.' },
    { question: 'Quels sont les délais de livraison ?', answer: '2 à 5 jours ouvrés selon ta région. Tu reçois un SMS de suivi dès le départ.' },
  ],
  cosmetic: [
    { question: 'Convient-il aux peaux sensibles ?', answer: 'Oui, formule testée sous contrôle dermatologique. Si tu as une peau réactive, fais un test sur le bras 24h avant.' },
    { question: 'En combien de temps voit-on les résultats ?', answer: 'Les premiers effets apparaissent généralement en 5 à 7 jours d’utilisation quotidienne.' },
    { question: 'Comment l’utiliser ?', answer: 'Applique matin et soir sur peau propre et sèche, en mouvements circulaires. Évite le contour des yeux.' },
    { question: 'Le produit est-il testé sur les animaux ?', answer: 'Non, nous sommes cruelty-free et certifiés vegan.' },
  ],
  home: [
    { question: 'Le montage est-il inclus ?', answer: 'Le produit est livré pré-assemblé ; il te reste juste à fixer le plateau (instructions claires fournies).' },
    { question: 'Quelle garantie ?', answer: '2 ans pièces et main-d’œuvre. SAV réactif sous 48h en cas de souci.' },
    { question: 'Puis-je voir les vraies dimensions ?', answer: 'Les cotes précises sont en bas de fiche, section Spécifications. N’hésite pas à nous écrire si tu veux qu’on te confirme un usage particulier.' },
  ],
  tech: [
    { question: 'C’est compatible avec mon appareil ?', answer: 'Le produit est universel (USB-C / USB-A inclus). Si tu utilises un câble propriétaire (Apple Lightning, etc.), vérifie le port avant achat.' },
    { question: 'Quelle est la garantie ?', answer: '12 mois constructeur + 30 jours satisfait ou remboursé. Aucun frais de retour.' },
    { question: 'Combien de temps de charge ?', answer: 'Une charge complète prend environ 90 minutes. La charge rapide atteint 80 % en 30 min.' },
  ],
  food: [
    { question: 'Quelle conservation ?', answer: 'À conserver dans un endroit sec et frais. Une fois ouvert, à consommer sous 30 jours.' },
    { question: 'Contient-il des allergènes ?', answer: 'La liste complète des ingrédients et allergènes est en bas de page. Aucun ajout d’arachide, gluten ou lactose dans cette recette.' },
    { question: 'D’où vient le produit ?', answer: 'Fabriqué dans nos ateliers en Tunisie à partir d’ingrédients sélectionnés localement.' },
  ],
  wellness: [
    { question: 'En combien de temps observe-t-on des effets ?', answer: 'La plupart des utilisateurs constatent des bénéfices dès 14 jours d’utilisation régulière. Une cure de 3 mois est conseillée pour des résultats durables.' },
    { question: 'Y a-t-il des contre-indications ?', answer: 'Déconseillé aux femmes enceintes ou allaitantes, et aux enfants de moins de 12 ans. En cas de traitement, demande l’avis de ton médecin.' },
    { question: 'Comment le prendre ?', answer: '1 gélule par jour, le matin avec un grand verre d’eau, au cours du repas.' },
  ],
};

const SPEC_TEMPLATES: Record<TemplateNiche, ProductSpecItem[]> = {
  fashion: [
    { key: 'Matière',     value: '100 % coton bio (200 g/m²)' },
    { key: 'Coupe',       value: 'Ajustée — taille comme indiqué' },
    { key: 'Tailles',     value: 'S · M · L · XL' },
    { key: 'Entretien',   value: 'Machine 30°, repassage doux' },
    { key: 'Origine',     value: 'Tissu européen, confection Tunisie' },
  ],
  cosmetic: [
    { key: 'Contenance',  value: '50 ml' },
    { key: 'Texture',     value: 'Crème légère, non grasse' },
    { key: 'Parfum',      value: 'Discret, naturel' },
    { key: 'Convient à',  value: 'Tous types de peau' },
    { key: 'Conservation', value: '12 mois après ouverture' },
  ],
  home: [
    { key: 'Dimensions',  value: '120 × 60 × 75 cm (L × l × H)' },
    { key: 'Poids',       value: '14 kg' },
    { key: 'Matière',     value: 'Bois massif chêne + acier' },
    { key: 'Garantie',    value: '2 ans pièces & main-d’œuvre' },
    { key: 'Montage',     value: 'Pré-assemblé — 5 min de finition' },
  ],
  tech: [
    { key: 'Connectique', value: 'USB-C / USB-A inclus' },
    { key: 'Capacité',    value: '10 000 mAh' },
    { key: 'Temps de charge', value: '90 min (charge rapide 80 % en 30 min)' },
    { key: 'Compatibilité', value: 'iPhone, Android, tablettes, MacBook' },
    { key: 'Garantie',    value: '12 mois constructeur' },
  ],
  food: [
    { key: 'Poids net',   value: '250 g' },
    { key: 'Ingrédients', value: 'Liste complète sur l’étiquette' },
    { key: 'Origine',     value: 'Fabriqué en Tunisie' },
    { key: 'Conservation', value: '6 mois à température ambiante' },
    { key: 'Allergènes',  value: 'Aucun allergène majeur ajouté' },
  ],
  wellness: [
    { key: 'Format',      value: '60 gélules' },
    { key: 'Posologie',   value: '1 gélule/jour avec le repas' },
    { key: 'Cure recommandée', value: '3 mois' },
    { key: 'Composition', value: 'Origine 100 % naturelle' },
    { key: 'Norme',       value: 'ISO 22000' },
  ],
};

// ─── Icon registry ─────────────────────────────────────────────────
const FEATURE_ICON_MAP: Record<FeatureIcon, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, shield: Shield, leaf: Leaf, zap: Zap, heart: Heart,
  award: Award, gift: Gift, truck: Truck, clock: Clock, check: Check,
  star: Star, recycle: Recycle,
};
const FEATURE_ICON_LIST: FeatureIcon[] = [
  'sparkles', 'shield', 'leaf', 'zap', 'heart', 'award',
  'gift', 'truck', 'clock', 'check', 'star', 'recycle',
];

export function featureIconComponent(id: FeatureIcon | string): React.ComponentType<{ className?: string }> {
  return FEATURE_ICON_MAP[id as FeatureIcon] || Sparkles;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE PICKER — dropdown réutilisable pour Features/FAQ/Specs.
// Ajoute le template à la liste existante (pas de remplacement → 0 perte).
// ═══════════════════════════════════════════════════════════════════
function TemplatePicker({ onPick }: { onPick: (niche: TemplateNiche) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5"
      >
        <Wand2 className="h-3.5 w-3.5" /> Importer modèle
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <>
          {/* Outside-click guard */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {TEMPLATE_NICHES.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => { onPick(n.id); setOpen(false); }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FEATURES (USPs)
// ═══════════════════════════════════════════════════════════════════
export function FeaturesEditor({
  value,
  onChange,
}: {
  value?: ProductFeature[];
  onChange: (next: ProductFeature[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductFeature>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { icon: 'sparkles', title: '', subtitle: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">Points forts (USPs)</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            3 à 6 bullets avec icône. Ce que le client scanne avant de lire la description.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TemplatePicker onPick={(n) => onChange([...(list), ...FEATURE_TEMPLATES[n]])} />
          <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Aucun point fort — clique « Ajouter » pour mettre en avant 3-6 bénéfices clés." />
      ) : (
        <ul className="space-y-2">
          {list.map((f, i) => {
            const Icon = featureIconComponent(f.icon);
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5"
              >
                <details className="relative">
                  <summary
                    className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg bg-primary/10 text-primary marker:hidden"
                    title="Changer l'icône"
                  >
                    <Icon className="h-4 w-4" />
                  </summary>
                  <div className="absolute left-0 top-11 z-20 grid w-52 grid-cols-6 gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                    {FEATURE_ICON_LIST.map((id) => {
                      const IC = FEATURE_ICON_MAP[id];
                      const active = id === f.icon;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => update(i, { icon: id })}
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-md transition-colors',
                            active ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          title={id}
                        >
                          <IC className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </details>
                <div className="space-y-1.5">
                  <Input
                    value={f.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="Ex: Livraison express 48h"
                    className="h-9 text-sm font-medium"
                  />
                  <Input
                    value={f.subtitle || ''}
                    onChange={(e) => update(i, { subtitle: e.target.value })}
                    placeholder="Sous-titre (optionnel) — détaille en quelques mots"
                    className="h-8 text-[11px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 place-items-center self-center rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════
export function FaqEditor({
  value,
  onChange,
}: {
  value?: ProductFaqItem[];
  onChange: (next: ProductFaqItem[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductFaqItem>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { question: '', answer: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">FAQ produit</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Lève les objections AVANT le formulaire de commande. Massivement efficace en COD.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TemplatePicker onPick={(n) => onChange([...(list), ...FAQ_TEMPLATES[n]])} />
          <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Pas de FAQ — pense aux 3-5 doutes les plus fréquents (taille, matière, retour, fonctionnement)." />
      ) : (
        <ul className="space-y-2">
          {list.map((q, i) => (
            <li
              key={i}
              className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  value={q.question}
                  onChange={(e) => update(i, { question: e.target.value })}
                  placeholder="Question fréquente ?"
                  className="h-9 flex-1 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={q.answer}
                onChange={(e) => update(i, { answer: e.target.value })}
                placeholder="Réponse claire et rassurante (2-4 lignes)"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SPECS (key/value)
// ═══════════════════════════════════════════════════════════════════
export function SpecsEditor({
  value,
  onChange,
}: {
  value?: ProductSpecItem[];
  onChange: (next: ProductSpecItem[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductSpecItem>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { key: '', value: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">Spécifications</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Table clé / valeur. Matière, poids, dimensions, contenu de la boîte, garantie…
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TemplatePicker onPick={(n) => onChange([...(list), ...SPEC_TEMPLATES[n]])} />
          <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Aucune spécification — important pour cosmétique, déco, mode, tech." />
      ) : (
        <ul className="space-y-1.5">
          {list.map((s, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                value={s.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="Matière"
                className="h-9 text-sm font-medium"
              />
              <Input
                value={s.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="100 % coton bio"
                className="h-9 text-sm"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHIPPING & RETURNS
// ═══════════════════════════════════════════════════════════════════
export function ShippingInfoEditor({
  value,
  onChange,
}: {
  value?: ProductShippingInfo;
  onChange: (next: ProductShippingInfo | undefined) => void;
}) {
  const v = value || {};
  const update = (patch: Partial<ProductShippingInfo>) => {
    const next = { ...v, ...patch };
    // Si tout est vide on remonte undefined pour ne pas polluer le payload.
    const allEmpty = !next.deliveryTime && !next.deliveryNote && !next.returnDays && !next.returnNote;
    onChange(allEmpty ? undefined : next);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold">Livraison & retours</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Réponds aux 3 questions COD : délai, frais, retour. Bloc affiché sous les badges.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ship-time" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Délai de livraison
          </Label>
          <Input
            id="ship-time"
            value={v.deliveryTime || ''}
            onChange={(e) => update({ deliveryTime: e.target.value || undefined })}
            placeholder="Ex: 2 à 5 jours ouvrés"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ship-note" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Note livraison
          </Label>
          <Input
            id="ship-note"
            value={v.deliveryNote || ''}
            onChange={(e) => update({ deliveryNote: e.target.value || undefined })}
            placeholder="Ex: Gratuit dès 200 TND"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ret-days" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Fenêtre de retour (jours)
          </Label>
          <Input
            id="ret-days"
            type="number"
            min={0}
            max={365}
            value={v.returnDays ?? ''}
            onChange={(e) => update({ returnDays: e.target.value ? Math.max(0, parseInt(e.target.value, 10)) : undefined })}
            placeholder="14"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ret-note" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Note retour
          </Label>
          <Input
            id="ret-note"
            value={v.returnNote || ''}
            onChange={(e) => update({ returnNote: e.target.value || undefined })}
            placeholder="Ex: Sans question, sans frais"
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIDEO PRODUIT
// Accepte YouTube/Vimeo (parse l'id côté storefront) ou MP4 direct.
// ═══════════════════════════════════════════════════════════════════
export function VideoEditor({
  value,
  onChange,
}: {
  value?: ProductVideo;
  onChange: (next: ProductVideo | undefined) => void;
}) {
  const v = value || { url: '' };
  const update = (patch: Partial<ProductVideo>) => {
    const next = { ...v, ...patch };
    if (!next.url) {
      onChange(undefined);
      return;
    }
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold">Vidéo produit</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          YouTube, Vimeo ou MP4 direct. Boost conversion de +30 à +80 % sur lifestyle, mode, cosmétique.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor="video-url" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            URL de la vidéo
          </Label>
          <Input
            id="video-url"
            value={v.url}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="video-title" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Titre (optionnel)
          </Label>
          <Input
            id="video-title"
            value={v.title || ''}
            onChange={(e) => update({ title: e.target.value || undefined })}
            placeholder="Voir le produit en action"
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPARATIF — table 3 colonnes (critère / nous / autres)
// ═══════════════════════════════════════════════════════════════════
export function ComparisonEditor({
  value,
  onChange,
}: {
  value?: ProductComparison;
  onChange: (next: ProductComparison | undefined) => void;
}) {
  const v = value || { rows: [] };
  const rows = v.rows;
  const updateRow = (i: number, patch: Partial<ProductComparisonRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...v, rows: next });
  };
  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    if (next.length === 0 && !v.title && !v.usLabel && !v.themLabel) {
      onChange(undefined);
      return;
    }
    onChange({ ...v, rows: next });
  };
  const addRow = () => {
    onChange({ ...v, rows: [...rows, { criterion: '', us: '', them: '' }] });
  };
  const updateMeta = (patch: Partial<Omit<ProductComparison, 'rows'>>) => {
    onChange({ ...v, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">Comparatif</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Critère + ta valeur + valeur concurrente. Format "nous vs les autres" — fort sur cosmétique et compléments.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Titre du bloc</Label>
          <Input
            value={v.title || ''}
            onChange={(e) => updateMeta({ title: e.target.value || undefined })}
            placeholder="Pourquoi nous choisir"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Colonne « nous »</Label>
          <Input
            value={v.usLabel || ''}
            onChange={(e) => updateMeta({ usLabel: e.target.value || undefined })}
            placeholder="Nous"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Colonne « autres »</Label>
          <Input
            value={v.themLabel || ''}
            onChange={(e) => updateMeta({ themLabel: e.target.value || undefined })}
            placeholder="Autres"
            className="h-9 text-sm"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyHint text="Aucune ligne — clique « Ajouter » pour comparer 3 à 5 critères clés." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2"
            >
              <Input
                value={r.criterion}
                onChange={(e) => updateRow(i, { criterion: e.target.value })}
                placeholder="Composition"
                className="h-9 text-sm font-medium"
              />
              <Input
                value={r.us}
                onChange={(e) => updateRow(i, { us: e.target.value })}
                placeholder="100 % naturel"
                className="h-9 text-sm"
              />
              <Input
                value={r.them}
                onChange={(e) => updateRow(i, { them: e.target.value })}
                placeholder="Parabens, sulfates"
                className="h-9 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCORE CONVERSION — petite barre de progression + nudge.
// Calcule un score 0-100 % à partir des sections renseignées et
// renvoie aussi la liste des sections manquantes pour orienter le
// vendeur. Pure : pas d'effet de bord, ré-utilisable n'importe où.
// ═══════════════════════════════════════════════════════════════════
export interface ConversionScoreInputs {
  images: string[];
  description?: string;
  features?: ProductFeature[];
  specs?: ProductSpecItem[];
  faq?: ProductFaqItem[];
  shippingInfo?: ProductShippingInfo;
  video?: ProductVideo;
  comparison?: ProductComparison;
}

interface ScoreBreakdown {
  score: number;            // 0-100
  filled: string[];
  missing: string[];
}

export function computeConversionScore(i: ConversionScoreInputs): ScoreBreakdown {
  // Chaque critère vaut un poids — j'ai pondéré selon l'impact mesuré
  // typique sur le funnel COD (3+ images & description sont les vraies
  // briques; les autres sont des amplificateurs).
  const checks: Array<{ id: string; label: string; ok: boolean; weight: number }> = [
    { id: 'images',     label: '3 images ou plus',           ok: (i.images?.length || 0) >= 3,       weight: 18 },
    { id: 'description', label: 'Description longue',         ok: (i.description?.trim().length || 0) >= 80, weight: 15 },
    { id: 'features',   label: 'Au moins 3 points forts',    ok: (i.features?.length || 0) >= 3,     weight: 14 },
    { id: 'specs',      label: 'Au moins 3 spécifications',  ok: (i.specs?.length || 0) >= 3,        weight: 12 },
    { id: 'faq',        label: 'Au moins 2 questions FAQ',   ok: (i.faq?.length || 0) >= 2,          weight: 14 },
    { id: 'shipping',   label: 'Bloc livraison / retours',   ok: !!(i.shippingInfo && (i.shippingInfo.deliveryTime || i.shippingInfo.returnNote || i.shippingInfo.returnDays)), weight: 12 },
    { id: 'video',      label: 'Vidéo produit',              ok: !!(i.video?.url && i.video.url.trim()), weight: 10 },
    { id: 'comparison', label: 'Comparatif',                 ok: !!(i.comparison?.rows && i.comparison.rows.length >= 2), weight: 5 },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const gained = checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  return {
    score: Math.round((gained / total) * 100),
    filled: checks.filter((c) => c.ok).map((c) => c.label),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}

export function ConversionScoreBar({ inputs }: { inputs: ConversionScoreInputs }) {
  const { score, missing } = computeConversionScore(inputs);
  const tier = score >= 85 ? 'high' : score >= 55 ? 'mid' : 'low';
  const tierStyle = {
    high: { bg: 'from-emerald-500 to-teal-500', text: 'text-emerald-700', label: 'Page solide — bien jouée.' },
    mid:  { bg: 'from-amber-500 to-orange-500', text: 'text-amber-700',   label: 'Page correcte — pousse à +85 % pour bien convertir.' },
    low:  { bg: 'from-rose-500 to-pink-500',    text: 'text-rose-700',    label: 'Page incomplète — quelques sections clés et tu doubles le potentiel.' },
  }[tier];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center gap-4 px-4 py-3 sm:px-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold tracking-tight">Page de vente — score de conversion</p>
            <span className={cn('text-sm font-bold tabular-nums', tierStyle.text)}>{score} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', tierStyle.bg)}
              style={{ width: `${score}%` }}
            />
          </div>
          <p className={cn('mt-1.5 text-[11px] font-medium', tierStyle.text)}>{tierStyle.label}</p>
          {missing.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              <span className="font-semibold">Reste à faire :</span> {missing.slice(0, 4).join(' · ')}
              {missing.length > 4 && '…'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Helpers UI
// ═══════════════════════════════════════════════════════════════════
function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
      {text}
    </p>
  );
}
