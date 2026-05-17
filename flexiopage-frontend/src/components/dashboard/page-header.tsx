/**
 * Compact page header — replaces the oversized rounded-3xl hero banners that
 * duplicate what's already shown in the top navbar. Goal: one line on desktop,
 * tight wrap on mobile, no gradient/blur. The optional `description` and
 * `actions` slots cover the few pages that need a one-liner of context or
 * a right-aligned button row.
 */
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned slot for buttons, switchers, etc. */
  actions?: React.ReactNode;
  /** Optional pill shown above the title (e.g. status, env). */
  eyebrow?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, title, description, actions, eyebrow, className }: Props) {
  return (
    <header className={cn('flex flex-col gap-2 pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{eyebrow}</div>
        )}
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" />}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
