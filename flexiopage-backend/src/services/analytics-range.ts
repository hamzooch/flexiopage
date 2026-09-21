/**
 * Date-window math for store analytics. All calendar arithmetic uses the
 * store IANA timezone so KPI totals and timeseries buckets share the same days.
 */
import {
  addCalendarDays,
  addCalendarMonthsYm,
  calendarDaysInclusive,
  endOfZonedDay,
  lastYmdOfMonth,
  resolveStoreTimeZone,
  startOfZonedDay,
  startOfZonedMonth,
  utcToZonedYmd,
  utcToZonedYearMonth,
} from '../utils/store-timezone';

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

export interface CustomRange {
  /** Inclusive start calendar day (YYYY-MM-DD) in the store timezone. */
  from: string;
  /** Inclusive end calendar day (YYYY-MM-DD) in the store timezone. */
  to: string;
}

export interface RangeWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: 'day' | 'month';
  buckets: number;
  timeZone: string;
  fromYmd: string;
  toYmd: string;
}

export type TimeseriesPoint = { revenue: number; sales: number; orders: number; paid: number };

function windowForYmdRange(fromYmd: string, toYmd: string, timeZone: string): RangeWindow {
  const from = startOfZonedDay(fromYmd, timeZone);
  const to = endOfZonedDay(toYmd, timeZone);
  const days = Math.max(1, calendarDaysInclusive(fromYmd, toYmd));
  const prevToYmd = addCalendarDays(fromYmd, -1);
  const prevFromYmd = addCalendarDays(prevToYmd, -(days - 1));
  const bucket: 'day' | 'month' = days > 62 ? 'month' : 'day';
  const fromParts = fromYmd.split('-').map(Number) as [number, number, number];
  const toParts = toYmd.split('-').map(Number) as [number, number, number];
  const buckets = bucket === 'day'
    ? days
    : (toParts[0] - fromParts[0]) * 12 + (toParts[1] - fromParts[1]) + 1;
  return {
    from,
    to,
    prevFrom: startOfZonedDay(prevFromYmd, timeZone),
    prevTo: endOfZonedDay(prevToYmd, timeZone),
    bucket,
    buckets,
    timeZone,
    fromYmd,
    toYmd,
  };
}

export function resolveRange(
  range: RangeKey,
  now: Date = new Date(),
  custom?: CustomRange,
  timeZoneRaw?: string | null,
): RangeWindow {
  const timeZone = resolveStoreTimeZone(timeZoneRaw);
  const todayYmd = utcToZonedYmd(now, timeZone);

  if (range === '12m') {
    const fromYmd = `${addCalendarMonthsYm(todayYmd.slice(0, 7), -11)}-01`;
    const from = startOfZonedDay(fromYmd, timeZone);
    const to = endOfZonedDay(todayYmd, timeZone);
    const prevToYmd = addCalendarDays(fromYmd, -1);
    const prevFromYmd = `${addCalendarMonthsYm(fromYmd.slice(0, 7), -11)}-01`;
    return {
      from,
      to,
      prevFrom: startOfZonedDay(prevFromYmd, timeZone),
      prevTo: endOfZonedDay(prevToYmd, timeZone),
      bucket: 'month',
      buckets: 12,
      timeZone,
      fromYmd,
      toYmd: todayYmd,
    };
  }

  if (range === 'custom' && custom) {
    return windowForYmdRange(custom.from, custom.to, timeZone);
  }

  if (range === 'yesterday') {
    const ymd = addCalendarDays(todayYmd, -1);
    return windowForYmdRange(ymd, ymd, timeZone);
  }

  const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const fromYmd = addCalendarDays(todayYmd, -(days - 1));
  return windowForYmdRange(fromYmd, todayYmd, timeZone);
}

export function emptyBucket(
  from: Date,
  to: Date,
  bucket: 'day' | 'month',
  timeZone: string,
): Map<string, TimeseriesPoint> {
  const out = new Map<string, TimeseriesPoint>();
  const zero = (): TimeseriesPoint => ({ revenue: 0, sales: 0, orders: 0, paid: 0 });
  if (bucket === 'month') {
    let ym = utcToZonedYearMonth(from, timeZone);
    const endYm = utcToZonedYearMonth(to, timeZone);
    while (ym <= endYm) {
      out.set(ym, zero());
      ym = addCalendarMonthsYm(ym, 1);
    }
    return out;
  }
  let ymd = utcToZonedYmd(from, timeZone);
  const endYmd = utcToZonedYmd(to, timeZone);
  while (ymd <= endYmd) {
    out.set(ymd, zero());
    ymd = addCalendarDays(ymd, 1);
  }
  return out;
}

export function fillTimeseries(
  from: Date,
  to: Date,
  bucket: 'day' | 'month',
  timeZone: string,
  rows: Array<{ _id: string; orders: number; paid: number; revenue: number; sales: number }>,
): Array<{ date: string } & TimeseriesPoint> {
  const map = emptyBucket(from, to, bucket, timeZone);
  for (const row of rows) {
    if (!row?._id) continue;
    map.set(row._id, {
      revenue: row.revenue || 0,
      sales: row.sales || 0,
      orders: row.orders || 0,
      paid: row.paid || 0,
    });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}

export function monthlyGoalWindow(now: Date, timeZoneRaw?: string | null): { from: Date; to: Date; todayYmd: string; lastYmd: string } {
  const timeZone = resolveStoreTimeZone(timeZoneRaw);
  const todayYmd = utcToZonedYmd(now, timeZone);
  const lastYmd = lastYmdOfMonth(todayYmd);
  return {
    from: startOfZonedMonth(todayYmd, timeZone),
    to: endOfZonedDay(lastYmd, timeZone),
    todayYmd,
    lastYmd,
  };
}

