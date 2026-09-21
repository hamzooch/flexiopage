/** Default IANA zone for a store's target country. Unknown → UTC. */
const COUNTRY_TIMEZONE: Record<string, string> = {
  MA: 'Africa/Casablanca', TN: 'Africa/Tunis', DZ: 'Africa/Algiers',
  LY: 'Africa/Tripoli', EG: 'Africa/Cairo', MR: 'Africa/Nouakchott',
  SN: 'Africa/Dakar', CI: 'Africa/Abidjan', ML: 'Africa/Bamako',
  BF: 'Africa/Ouagadougou', NE: 'Africa/Niamey', TG: 'Africa/Lome',
  BJ: 'Africa/Porto-Novo', GN: 'Africa/Conakry', GA: 'Africa/Libreville',
  CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa', NG: 'Africa/Lagos',
  GH: 'Africa/Accra', CM: 'Africa/Douala', KE: 'Africa/Nairobi',
  ZA: 'Africa/Johannesburg', RW: 'Africa/Kigali', UG: 'Africa/Kampala',
  TZ: 'Africa/Dar_es_Salaam', ET: 'Africa/Addis_Ababa', AO: 'Africa/Luanda',
  ZW: 'Africa/Harare', ZM: 'Africa/Lusaka', MZ: 'Africa/Maputo',
  MW: 'Africa/Blantyre', BW: 'Africa/Gaborone', NA: 'Africa/Windhoek',
  MG: 'Indian/Antananarivo', MU: 'Indian/Mauritius', SD: 'Africa/Khartoum',
  SA: 'Asia/Riyadh', AE: 'Asia/Dubai', QA: 'Asia/Qatar', KW: 'Asia/Kuwait',
  BH: 'Asia/Bahrain', OM: 'Asia/Muscat', IQ: 'Asia/Baghdad', JO: 'Asia/Amman',
  LB: 'Asia/Beirut', YE: 'Asia/Aden', PS: 'Asia/Hebron', SY: 'Asia/Damascus',
  FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich',
  DE: 'Europe/Berlin', ES: 'Europe/Madrid', IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam', PT: 'Europe/Lisbon', GB: 'Europe/London',
  TR: 'Europe/Istanbul', CA: 'America/Toronto', US: 'America/New_York',
};

export function timezoneForCountry(country?: string | null): string {
  const code = (country || '').trim().toUpperCase();
  return (code && COUNTRY_TIMEZONE[code]) || 'UTC';
}

export const STORE_TIMEZONES: Array<{ id: string; label: string; group: string }> = [
  { id: 'Africa/Casablanca', label: 'Casablanca (Maroc)', group: 'Maghreb' },
  { id: 'Africa/Tunis', label: 'Tunis', group: 'Maghreb' },
  { id: 'Africa/Algiers', label: 'Alger', group: 'Maghreb' },
  { id: 'Africa/Tripoli', label: 'Tripoli', group: 'Maghreb' },
  { id: 'Africa/Cairo', label: 'Le Caire', group: 'Maghreb' },
  { id: 'Africa/Dakar', label: 'Dakar', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Abidjan', label: 'Abidjan', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Lagos', label: 'Lagos', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Accra', label: 'Accra', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Bamako', label: 'Bamako', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Ouagadougou', label: 'Ouagadougou', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Lome', label: 'Lomé', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Porto-Novo', label: 'Porto-Novo', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Conakry', label: 'Conakry', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Niamey', label: 'Niamey', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Nouakchott', label: 'Nouakchott', group: 'Afrique de l’Ouest' },
  { id: 'Africa/Douala', label: 'Douala', group: 'Afrique' },
  { id: 'Africa/Nairobi', label: 'Nairobi', group: 'Afrique' },
  { id: 'Africa/Johannesburg', label: 'Johannesburg', group: 'Afrique' },
  { id: 'Africa/Kinshasa', label: 'Kinshasa', group: 'Afrique' },
  { id: 'Africa/Addis_Ababa', label: 'Addis-Abeba', group: 'Afrique' },
  { id: 'Asia/Riyadh', label: 'Riyad', group: 'Golfe & Levant' },
  { id: 'Asia/Dubai', label: 'Dubaï', group: 'Golfe & Levant' },
  { id: 'Asia/Qatar', label: 'Doha', group: 'Golfe & Levant' },
  { id: 'Asia/Kuwait', label: 'Koweït', group: 'Golfe & Levant' },
  { id: 'Asia/Amman', label: 'Amman', group: 'Golfe & Levant' },
  { id: 'Asia/Beirut', label: 'Beyrouth', group: 'Golfe & Levant' },
  { id: 'Asia/Baghdad', label: 'Bagdad', group: 'Golfe & Levant' },
  { id: 'Europe/Paris', label: 'Paris', group: 'Europe' },
  { id: 'Europe/Brussels', label: 'Bruxelles', group: 'Europe' },
  { id: 'Europe/London', label: 'Londres', group: 'Europe' },
  { id: 'Europe/Berlin', label: 'Berlin', group: 'Europe' },
  { id: 'Europe/Madrid', label: 'Madrid', group: 'Europe' },
  { id: 'Europe/Rome', label: 'Rome', group: 'Europe' },
  { id: 'Europe/Istanbul', label: 'Istanbul', group: 'Europe' },
  { id: 'America/New_York', label: 'New York', group: 'Amériques' },
  { id: 'America/Toronto', label: 'Toronto', group: 'Amériques' },
  { id: 'UTC', label: 'UTC', group: 'Autre' },
];

export function timezoneLabel(tz?: string | null): string {
  const id = (tz || 'UTC').trim() || 'UTC';
  const known = STORE_TIMEZONES.find((z) => z.id === id);
  if (known) return known.label;
  const city = id.split('/').pop()?.replace(/_/g, ' ') || id;
  return city;
}

export function timezoneSelectGroups(): string[] {
  return Array.from(new Set(STORE_TIMEZONES.map((z) => z.group)));
}
