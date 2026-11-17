import { mediaUrl } from '@/lib/utils';

interface Props {
  name?: string;
  logo?: string;
  visitorCountry?: string | null;
  allowedCountries?: string[];
}

function countryLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Shown when the seller locked the shop to specific countries. */
export function GeoBlockedScreen({ name, logo, visitorCountry, allowedCountries }: Props) {
  const logoSrc = mediaUrl(logo);
  const allowed = (allowedCountries || []).filter(Boolean);
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-6 py-16 text-neutral-900">
      <div className="w-full max-w-md text-center">
        {logoSrc ? (
          <img src={logoSrc} alt="" className="mx-auto mb-6 h-16 w-16 rounded-2xl object-cover" />
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
          {name || 'Boutique'}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Cette boutique n’est pas disponible dans ton pays
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Le vendeur a limité l’accès aux visiteurs qui se trouvent dans les pays ciblés par la boutique.
        </p>
        {visitorCountry ? (
          <p className="mt-4 text-sm text-neutral-700">
            Pays détecté depuis ton adresse IP : <span className="font-medium">{countryLabel(visitorCountry)}</span>
          </p>
        ) : null}
        {allowed.length > 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Disponible pour : {allowed.map(countryLabel).join(', ')}
          </p>
        ) : null}
      </div>
    </main>
  );
}
