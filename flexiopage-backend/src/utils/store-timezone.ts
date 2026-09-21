/**
 * Calendar helpers in a store IANA timezone.
 *
 * Analytics windows must follow the seller's calendar day, not the Node
 * process locale and not UTC-only Mongo `$dateToString`. These helpers
 * convert YYYY-MM-DD wall times ↔ UTC instants without extra libraries.
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(\d{2})$/;

export type Ymd = { y: number; m: number; d: number };

export function isYmd(raw: string): boolean {
  if (!YMD_RE.test(raw)) return false;
  const parsed = parseYmd(raw);
  if (!parsed) return false;
  // Reject 2026-02-31 etc. by round-tripping through UTC calendar math.
  const utc = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
  const dt = new Date(utc);
  return dt.getUTCFullYear() === parsed.y && dt.getUTCMonth() + 1 === parsed.m && dt.getUTCDate() === parsed.d;
}

export function parseYmd(raw: string): Ymd | null {
  const match = YMD_RE.exec(raw);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatYm(y: number, m: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Falls back to UTC when the store timezone is missing or not IANA. */
export function resolveStoreTimeZone(raw?: string | null): string {
  const tz = (raw || '').trim();
  if (tz && isValidIanaTimeZone(tz)) return tz;
  return 'UTC';
}

/**
 * Offset of `date` in `timeZone`: wall-clock-as-UTC minus actual UTC.
 * UTC+1 → +3_600_000.
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Instant whose wall clock in `timeZone` is y-m-d h:m:s.ms. */
export function zonedWallToUtc(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, second, ms);
  const offset1 = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  const instant1 = utcGuess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(instant1), timeZone);
  return new Date(utcGuess - offset2);
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

export function utcToZonedYmd(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

export function utcToZonedYearMonth(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return formatYm(p.year, p.month);
}

export function startOfZonedDay(ymd: string, timeZone: string): Date {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  return zonedWallToUtc(p.y, p.m, p.d, 0, 0, 0, 0, timeZone);
}

export function endOfZonedDay(ymd: string, timeZone: string): Date {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  const next = addCalendarDays(ymd, 1);
  return new Date(startOfZonedDay(next, timeZone).getTime() - 1);
}

export function addCalendarDays(ymd: string, days: number): string {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addCalendarMonthsYm(ym: string, months: number): string {
  const match = YM_RE.exec(ym);
  if (!match) throw new Error(`invalid YYYY-MM: ${ym}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return formatYm(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
}

/** Inclusive Gregorian day count between two YYYY-MM-DD strings. */
export function calendarDaysInclusive(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return 0;
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.floor(ms / 86_400_000) + 1;
}

export function startOfZonedMonth(ymd: string, timeZone: string): Date {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  return startOfZonedDay(formatYmd(p.y, p.m, 1), timeZone);
}

export function lastYmdOfMonth(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  const nextMonth = new Date(Date.UTC(p.y, p.m, 1));
  const last = new Date(nextMonth.getTime() - 86_400_000);
  return formatYmd(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
}

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
  const tz = code ? COUNTRY_TIMEZONE[code] : undefined;
  return resolveStoreTimeZone(tz || 'UTC');
}
