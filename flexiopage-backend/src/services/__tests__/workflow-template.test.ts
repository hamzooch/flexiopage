import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BODY,
  clampDelayHours,
  clampDelayMinutes,
  firstNameOf,
  isDeliverableEmail,
  renderTemplate,
} from '../workflow-template';

describe('workflow template', () => {
  it('remplace les champs du scénario', () => {
    const text = renderTemplate(DEFAULT_BODY, {
      firstName: ' Amina',
      storeName: 'Atelier',
      product: 'Caftan',
      amount: '45 000 F CFA',
      link: 'https://exemple.test/payer',
    });
    expect(text).toContain('Bonjour Amina,');
    expect(text).toContain('chez Atelier');
    expect(text).toContain('Caftan — 45 000 F CFA');
    expect(text).toContain('https://exemple.test/payer');
  });

  it('borne les délais', () => {
    expect(clampDelayMinutes(0)).toBe(5);
    expect(clampDelayMinutes(999)).toBe(240);
    expect(clampDelayMinutes('30')).toBe(30);
    expect(clampDelayHours('nope')).toBe(24);
  });

  it('refuse les emails techniques et vides', () => {
    expect(isDeliverableEmail('a@b.co')).toBe(true);
    expect(isDeliverableEmail('cod-221@flexiopage.local')).toBe(false);
    expect(isDeliverableEmail('')).toBe(false);
  });

  it('prend le premier prénom', () => {
    expect(firstNameOf('Amina Diallo')).toBe('Amina');
    expect(firstNameOf('  ')).toBe('');
  });
});
