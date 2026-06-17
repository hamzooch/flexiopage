'use client';

/**
 * Dialog UI primitive — Radix-based, centré au milieu de l'écran, themé
 * sur la plateforme. Sert de socle aux helpers `useConfirm()` / `usePrompt()`
 * qui remplacent les `window.confirm` / `window.prompt` natifs (laids,
 * non-themables, mal positionnés sur mobile).
 *
 * Structure :
 *   <Dialog open onOpenChange>
 *     <DialogContent>
 *       <DialogHeader title="…" description="…" />
 *       <body custom>
 *       <DialogFooter>
 *         <Button cancel/confirm>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Largeur max du dialog. Defaut 'md' (28rem). */
    size?: 'sm' | 'md' | 'lg';
    /** Cache le bouton X de fermeture (utile pour les confirmations bloquantes). */
    hideClose?: boolean;
  }
>(({ className, children, size = 'md', hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Position centrée en X et Y, jamais hors écran sur mobile.
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        'w-[calc(100vw-2rem)]',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-md',
        size === 'lg' && 'max-w-lg',
        // Look & feel themé : bordure, fond, ombre, arrondi accordé au reste de l'app.
        'overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl',
        // Animations cohérentes avec l'overlay.
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'duration-200',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({
  title,
  description,
  icon,
  tone = 'default',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Affecte l'icône et la couleur d'accent du header. */
  tone?: 'default' | 'destructive' | 'warning' | 'success';
  className?: string;
}) {
  const toneStyles: Record<NonNullable<typeof tone>, string> = {
    default: 'bg-primary/10 text-primary',
    destructive: 'bg-rose-500/10 text-rose-600',
    warning: 'bg-amber-500/10 text-amber-700',
    success: 'bg-emerald-500/10 text-emerald-700',
  };

  return (
    <div className={cn('flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6', className)}>
      {icon && (
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', toneStyles[tone])}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1 pr-6">
        <DialogPrimitive.Title className="text-base font-semibold leading-tight tracking-tight sm:text-lg">
          {title}
        </DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>
    </div>
  );
}

function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 pb-4 sm:px-6', className)}>{children}</div>;
}

function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/30 px-5 py-3 sm:flex-row sm:justify-end sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
};
