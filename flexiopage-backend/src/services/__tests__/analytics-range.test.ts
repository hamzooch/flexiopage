import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  calendarDaysInclusive,
  endOfZonedDay,
  isYmd,
  resolveStoreTimeZone,
  startOfZonedDay,
  timezoneForCountry,
  utcToZonedYmd,
  zonedWallToUtc,
} from '../../utils/store-timezone';
import { emptyBucket, fillTimeseries, resolveRange } from '../analytics-range';

describe('store timezone', () => {
  it('mappe le pays cible vers un fuseau IANA', () => {
    expect(timezoneForCountry('MA')).toBe('Africa/Casablanca');
    expect(timezoneForCountry('tn')).toBe('Africa/Tunis');
    expect(timezoneForCountry('SN')).toBe('Africa/Dakar');
    expect(timezoneForCountry('')).toBe('UTC');
    expect(timezoneForCountry('XX')).toBe('UTC');
  });

  it('accepte une IANA valide et retombe sur UTC sinon', () => {
    expect(resolveStoreTimeZone('Africa/Casablanca')).toBe('Africa/Casablanca');
    expect(resolveStoreTimeZone('not-a-zone')).toBe('UTC');
    expect(resolveStoreTimeZone('')).toBe('UTC');
  });

  it('parse YYYY-MM-DD sans décalage UTC', () => {
    expect(isYmd('2026-09-21')).toBe(true);
    expect(isYmd('2026-02-31')).toBe(false);
    expect(isYmd('2026-13-01')).toBe(false);
  });

  it('convertit minuit Tunis (UTC+1) vers l instant UTC de la veille 23:00', () => {
    const start = startOfZonedDay('2026-09-21', 'Africa/Tunis');
    expect(start.toISOString()).toBe('2026-09-20T23:00:00.000Z');
    const end = endOfZonedDay('2026-09-21', 'Africa/Tunis');
    expect(end.toISOString()).toBe('2026-09-21T22:59:59.999Z');
    expect(utcToZonedYmd(start, 'Africa/Tunis')).toBe('2026-09-21');
    expect(utcToZonedYmd(end, 'Africa/Tunis')).toBe('2026-09-21');
  });

  it('ne décale pas un mur UTC', () => {
    const instant = zonedWallToUtc(2026, 9, 21, 10, 0, 0, 0, 'UTC');
    expect(instant.toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });
});

describe('resolveRange', () => {
  const noonUtc = new Date('2026-09-21T12:00:00.000Z');

  it('today en UTC+1 = un seul jour calendaire boutique', () => {
    const w = resolveRange('today', noonUtc, undefined, 'Africa/Tunis');
    expect(w.fromYmd).toBe('2026-09-21');
    expect(w.toYmd).toBe('2026-09-21');
    expect(w.buckets).toBe(1);
    const keys = [...emptyBucket(w.from, w.to, 'day', w.timeZone).keys()];
    expect(keys).toEqual(['2026-09-21']);
  });

  it('7d produit 7 cles jour y compris aujourd hui', () => {
    const w = resolveRange('7d', noonUtc, undefined, 'Africa/Tunis');
    const keys = [...emptyBucket(w.from, w.to, 'day', w.timeZone).keys()];
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-09-15');
    expect(keys[6]).toBe('2026-09-21');
  });

  it('custom YYYY-MM-DD reste sur les jours demandés en UTC+1', () => {
    const w = resolveRange('custom', noonUtc, { from: '2026-09-01', to: '2026-09-07' }, 'Africa/Tunis');
    expect(w.fromYmd).toBe('2026-09-01');
    expect(w.toYmd).toBe('2026-09-07');
    expect(calendarDaysInclusive(w.fromYmd, w.toYmd)).toBe(7);
    expect(utcToZonedYmd(w.from, 'Africa/Tunis')).toBe('2026-09-01');
    expect(utcToZonedYmd(w.to, 'Africa/Tunis')).toBe('2026-09-07');
  });

  it('yesterday est la veille boutique, pas un rolling 24h', () => {
    const w = resolveRange('yesterday', noonUtc, undefined, 'Africa/Tunis');
    expect(w.fromYmd).toBe('2026-09-20');
    expect(w.toYmd).toBe('2026-09-20');
  });
});

describe('fillTimeseries', () => {
  it('ne jette plus une journée Mongo hors map UTC', () => {
    const from = startOfZonedDay('2026-09-21', 'Africa/Tunis');
    const to = endOfZonedDay('2026-09-21', 'Africa/Tunis');
    const series = fillTimeseries(from, to, 'day', 'Africa/Tunis', [
      { _id: '2026-09-21', orders: 2, paid: 1, revenue: 10, sales: 40 },
      { _id: '2026-09-20', orders: 1, paid: 0, revenue: 0, sales: 15 },
    ]);
    expect(series.map((p) => p.date)).toEqual(['2026-09-20', '2026-09-21']);
    expect(series.find((p) => p.date === '2026-09-21')?.sales).toBe(40);
    expect(series.find((p) => p.date === '2026-09-20')?.sales).toBe(15);
  });

  it('aligne la somme sales du graphe sur un agrégat du même jour boutique', () => {
    const w = resolveRange('today', new Date('2026-09-21T12:00:00.000Z'), undefined, 'Africa/Tunis');
    const series = fillTimeseries(w.from, w.to, 'day', w.timeZone, [
      { _id: '2026-09-21', orders: 3, paid: 0, revenue: 0, sales: 90 },
    ]);
    expect(series.reduce((sum, p) => sum + p.sales, 0)).toBe(90);
    expect(series).toHaveLength(1);
  });
});

describe('calendar helpers', () => {
  it('addCalendarDays traverse le mois', () => {
    expect(addCalendarDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
