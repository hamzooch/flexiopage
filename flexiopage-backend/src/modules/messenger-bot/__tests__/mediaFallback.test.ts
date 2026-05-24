import { describe, it, expect } from 'vitest';
import { mediaFallbackMessage, imagePromptHint } from '../utils/mediaFallback';

describe('mediaFallbackMessage', () => {
  it('renvoie un message non vide pour chaque (langue, type)', () => {
    const langs = ['ar', 'fr', 'en', 'darija_ma', 'darija_dz', 'darija_tn'] as const;
    const types = ['image', 'audio', 'document', 'sticker', 'video'] as const;
    for (const lang of langs) {
      for (const type of types) {
        expect(mediaFallbackMessage(lang, type).length).toBeGreaterThan(0);
      }
    }
  });

  it('regroupe les darijas sur le même texte', () => {
    const ma = mediaFallbackMessage('darija_ma', 'audio');
    expect(mediaFallbackMessage('darija_dz', 'audio')).toBe(ma);
    expect(mediaFallbackMessage('darija_tn', 'audio')).toBe(ma);
  });

  it('distingue les langues principales', () => {
    expect(mediaFallbackMessage('fr', 'audio')).not.toBe(mediaFallbackMessage('en', 'audio'));
    expect(mediaFallbackMessage('ar', 'audio')).not.toBe(mediaFallbackMessage('fr', 'audio'));
  });
});

describe('imagePromptHint', () => {
  it('renvoie un indice non vide par langue', () => {
    for (const lang of ['ar', 'fr', 'en', 'darija_ma'] as const) {
      expect(imagePromptHint(lang).length).toBeGreaterThan(0);
    }
  });
});
