/**
 * Verrou de scroll du <body> partagé et refcompté.
 *
 * Pourquoi : plusieurs composants (sidebar mobile, modals preview, galeries,
 * dialogues confirm/prompt via Radix) veulent bloquer le scroll du body en
 * même temps. Le pattern historique — chacun bidouille `document.body.style
 * .overflow` en direct — casse dès qu'ils se chevauchent : le premier qui
 * ferme restaure `''` et débloque le scroll alors qu'un autre a encore besoin
 * du lock, ou l'inverse, l'un laisse `hidden` bloqué à vie.
 *
 * Ce module expose UN point d'entrée unique. Chaque appel `lockBodyScroll()`
 * pousse un jeton dans un Set d'owners et retourne un `release` idempotent.
 * Le body reçoit la classe `scroll-locked` (via `body.scroll-locked { overflow:
 * hidden !important }` dans globals.css) SEULEMENT tant qu'au moins un owner
 * la tient. On utilise volontairement une classe CSS et non `body.style
 * .overflow` : Radix pilote son propre lock via inline style — la classe et
 * l'inline style cohabitent sans se stomp, chacun ayant sa mécanique.
 *
 * Usage React :
 *   useEffect(() => {
 *     if (!isOpen) return;
 *     const release = lockBodyScroll();
 *     return release;
 *   }, [isOpen]);
 */

const owners = new Set<symbol>();

export function lockBodyScroll(): () => void {
  const id = Symbol('body-scroll-lock');
  owners.add(id);
  if (owners.size === 1 && typeof document !== 'undefined') {
    document.body.classList.add('scroll-locked');
  }
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    owners.delete(id);
    if (owners.size === 0 && typeof document !== 'undefined') {
      document.body.classList.remove('scroll-locked');
    }
  };
}
