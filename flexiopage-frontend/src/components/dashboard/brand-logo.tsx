import { cn } from '@/lib/utils';

/** Logo de marque dans un cadre blanc, pour les cartes apps et intégrations. */
export function BrandLogo({
  src,
  bg,
  className,
  imgClassName,
}: {
  src: string;
  bg?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/10',
        className,
      )}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={cn('h-[78%] w-[78%] object-contain', imgClassName)} />
    </span>
  );
}
