'use client';

/**
 * Pagination compacte et accessible — utilisée par les listes dashboard
 * (commandes, produits, clients) et les écrans admin. Composant contrôlé :
 * le parent garde l'état (`page`, `pageSize`) et envoie une requête API
 * paginée. Quand on change de page, on scroll auto en haut de la liste.
 *
 * Pourquoi pas un composant headless (shadcn) ? On a besoin du compteur
 * "X — Y sur Z" et du picker de pageSize directement intégré ; un seul
 * composant est plus simple à brancher partout.
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Nombre total d'items toutes pages confondues (retourné par l'API). */
  total: number;
  /** Page courante (1-indexée). */
  page: number;
  /** Items par page. */
  pageSize: number;
  /** Appelé quand la page courante change. */
  onPageChange: (page: number) => void;
  /** Appelé quand le pageSize change (optionnel : si absent, picker masqué). */
  onPageSizeChange?: (size: number) => void;
  /** Tailles proposées dans le picker. Défaut : 20 / 50 / 100. */
  pageSizes?: number[];
  /** Désactive tous les contrôles (pendant un fetch). */
  disabled?: boolean;
  className?: string;
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizes = [20, 50, 100],
  disabled = false,
  className,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const firstIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastIdx = Math.min(safePage * pageSize, total);

  const go = (next: number) => {
    if (disabled) return;
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== safePage) onPageChange(clamped);
  };

  // Génère une liste compacte de pages à afficher : 1 … (page-1) page (page+1) … N.
  // Limite à 5 boutons numérotés visibles pour ne pas exploser sur mobile.
  const pages = computeVisiblePages(safePage, totalPages);

  // Si rien à paginer, on affiche juste le compteur (utile sur listes vides).
  if (total === 0) {
    return (
      <div className={cn('flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground', className)}>
        Aucun résultat
      </div>
    );
  }

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col gap-2 border-t border-border/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="text-xs text-muted-foreground">
        <strong className="text-foreground tabular-nums">{firstIdx}</strong>
        {' — '}
        <strong className="text-foreground tabular-nums">{lastIdx}</strong>
        {' sur '}
        <strong className="text-foreground tabular-nums">{total.toLocaleString()}</strong>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onPageSizeChange && (
          <select
            aria-label="Items par page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={disabled}
            className="h-8 rounded-md border border-border/60 bg-card px-2 text-xs disabled:opacity-50"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        )}

        <PageBtn label="Première" onClick={() => go(1)} disabled={disabled || safePage === 1} aria-label="Première page">
          <ChevronsLeft className="h-3.5 w-3.5" />
        </PageBtn>
        <PageBtn label="Précédente" onClick={() => go(safePage - 1)} disabled={disabled || safePage === 1} aria-label="Page précédente">
          <ChevronLeft className="h-3.5 w-3.5" />
        </PageBtn>

        {pages.map((p, i) => p === '…' ? (
          <span key={`gap-${i}`} className="grid h-8 w-8 place-items-center text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            disabled={disabled}
            aria-current={p === safePage ? 'page' : undefined}
            className={cn(
              'h-8 min-w-[2rem] rounded-md px-2 text-xs font-semibold tabular-nums transition-colors disabled:opacity-50',
              p === safePage
                ? 'bg-primary text-primary-foreground'
                : 'border border-border/60 bg-card text-foreground hover:bg-muted',
            )}
          >
            {p}
          </button>
        ))}

        <PageBtn label="Suivante" onClick={() => go(safePage + 1)} disabled={disabled || safePage === totalPages} aria-label="Page suivante">
          <ChevronRight className="h-3.5 w-3.5" />
        </PageBtn>
        <PageBtn label="Dernière" onClick={() => go(totalPages)} disabled={disabled || safePage === totalPages} aria-label="Dernière page">
          <ChevronsRight className="h-3.5 w-3.5" />
        </PageBtn>
      </div>
    </nav>
  );
}

function PageBtn({ children, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Retourne une liste de pages à afficher avec ellipses. Strategie :
 *   - Toujours montrer les pages 1 et N.
 *   - Toujours montrer page courante et ses voisines immédiates.
 *   - Mettre des '…' pour combler les gaps de >1.
 *   - Limite à ~7 entrées pour rester lisible sur mobile.
 */
function computeVisiblePages(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}
