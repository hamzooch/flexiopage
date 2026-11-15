import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { paintCampaignCaption } from '../campaign-caption';

describe('texte posé sur la photo', () => {
  it('garde le format et accepte une accroche arabe avec un prix barré', async () => {
    const base = await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#c4a574' },
    }).jpeg().toBuffer();
    const out = await paintCampaignCaption(base, {
      headline: '120 TND',
      kicker: 'العرض',
      strike: '160 TND',
      badge: '-25%',
    });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
    expect(out.equals(base)).toBe(false);
  }, 20000);
});
