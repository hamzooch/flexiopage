import { describe, expect, it } from 'vitest';
import {
  evaluateStoreGeoAccess,
  isPrivateOrLocalIp,
  targetCountries,
  visitorCountryFromRequest,
} from '../geo-access';

const snStore = {
  settings: {
    country: 'SN',
    geoAccess: { enabled: true, countries: ['SN', 'CI'] },
  },
};

describe('targetCountries', () => {
  it('uses the explicit allow-list when the seller picked countries', () => {
    expect(targetCountries(snStore)).toEqual(['SN', 'CI']);
  });

  it('falls back to the target country and enabled markets', () => {
    expect(targetCountries({
      settings: { country: 'TN', geoAccess: { enabled: true, countries: [] } },
      markets: [
        { country: 'tn', enabled: true },
        { country: 'DZ', enabled: false },
        { country: 'MA', enabled: true },
      ],
    })).toEqual(['TN', 'MA']);
  });
});

describe('evaluateStoreGeoAccess', () => {
  it('blocks a visitor outside the targeted countries', () => {
    const decision = evaluateStoreGeoAccess(
      { ip: '127.0.0.1', headers: { 'x-vercel-ip-country': 'FR' } },
      snStore,
    );
    expect(decision.blocked).toBe(true);
    expect(decision.visitorCountry).toBe('FR');
  });

  it('lets a visitor in a targeted country through', () => {
    const decision = evaluateStoreGeoAccess(
      { ip: '127.0.0.1', headers: { 'x-vercel-ip-country': 'sn' } },
      snStore,
    );
    expect(decision.blocked).toBe(false);
    expect(decision.visitorCountry).toBe('SN');
  });

  it('stays open when the lock is off or the country is unknown', () => {
    expect(evaluateStoreGeoAccess(
      { ip: '127.0.0.1', headers: { 'x-vercel-ip-country': 'FR' } },
      { settings: { geoAccess: { enabled: false, countries: ['SN'] } } },
    ).blocked).toBe(false);

    expect(evaluateStoreGeoAccess(
      { ip: '127.0.0.1', headers: {} },
      snStore,
    ).blocked).toBe(false);
  });

  it('does not lock the shop when no country is configured', () => {
    expect(evaluateStoreGeoAccess(
      { ip: '127.0.0.1', headers: { 'x-vercel-ip-country': 'FR' } },
      { settings: { geoAccess: { enabled: true, countries: [] } } },
    ).blocked).toBe(false);
  });
});

describe('visitorCountryFromRequest', () => {
  it('ignores a forged country header on a public IP and uses geoip', () => {
    const country = visitorCountryFromRequest({
      ip: '8.8.8.8',
      headers: { 'x-vercel-ip-country': 'SN', 'cf-ipcountry': 'SN' },
    });
    expect(country).toBe('US');
  });

  it('trusts Cloudflare when the request actually came through Cloudflare', () => {
    const country = visitorCountryFromRequest({
      ip: '8.8.8.8',
      headers: { 'cf-ray': 'abc', 'cf-ipcountry': 'CI' },
    });
    expect(country).toBe('CI');
  });

  it('trusts the country forwarded by our own server', () => {
    expect(visitorCountryFromRequest({
      ip: '10.0.0.4',
      headers: { 'x-vercel-ip-country': 'MA' },
    })).toBe('MA');
  });

  it('geolocates the visitor IP forwarded by our own server', () => {
    expect(visitorCountryFromRequest({
      ip: '::1',
      headers: { 'x-flexio-visitor-ip': '8.8.8.8' },
    })).toBe('US');
  });
});

describe('isPrivateOrLocalIp', () => {
  it('treats loopback and RFC1918 addresses as internal', () => {
    expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('::ffff:10.1.2.3')).toBe(true);
    expect(isPrivateOrLocalIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrLocalIp('172.15.0.1')).toBe(false);
  });
});
