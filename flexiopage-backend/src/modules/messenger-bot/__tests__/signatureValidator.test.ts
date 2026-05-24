import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { validateMetaSignature, timingSafeEqualStr } from '../utils/signatureValidator';

const SECRET = 'app_secret_test';
function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('validateMetaSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepte une signature HMAC valide', () => {
    expect(validateMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejette une signature falsifiée', () => {
    expect(validateMetaSignature(body, sign('autre chose'), SECRET)).toBe(false);
  });

  it('rejette un mauvais appSecret', () => {
    expect(validateMetaSignature(body, sign(body, 'mauvais'), SECRET)).toBe(false);
  });

  it('rejette un header absent ou mal formé', () => {
    expect(validateMetaSignature(body, undefined, SECRET)).toBe(false);
    expect(validateMetaSignature(body, 'sha1=deadbeef', SECRET)).toBe(false);
    expect(validateMetaSignature(body, 'pasdeschema', SECRET)).toBe(false);
  });

  it('rejette quand appSecret est absent', () => {
    expect(validateMetaSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('timingSafeEqualStr', () => {
  it('vrai pour deux chaînes identiques', () => {
    expect(timingSafeEqualStr('flexiopage_verify', 'flexiopage_verify')).toBe(true);
  });

  it('faux pour des chaînes différentes de même longueur', () => {
    expect(timingSafeEqualStr('abcdef', 'abcxyz')).toBe(false);
  });

  it('faux pour des longueurs différentes', () => {
    expect(timingSafeEqualStr('court', 'beaucoup_plus_long')).toBe(false);
  });

  it('faux si une valeur est absente', () => {
    expect(timingSafeEqualStr(undefined, 'x')).toBe(false);
    expect(timingSafeEqualStr('x', undefined)).toBe(false);
    expect(timingSafeEqualStr(undefined, undefined)).toBe(false);
  });
});
