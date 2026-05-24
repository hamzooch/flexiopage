import { describe, it, expect } from 'vitest';
import { parseWaMessage } from '../utils/waMessageParser';

describe('parseWaMessage', () => {
  it('classe un message texte', () => {
    expect(parseWaMessage({ type: 'text', text: { body: '  salut  ' } })).toEqual({
      kind: 'text',
      text: 'salut',
    });
  });

  it('marque un texte vide comme non supporté', () => {
    expect(parseWaMessage({ type: 'text', text: { body: '   ' } })).toEqual({ kind: 'unsupported' });
  });

  it('classe une image avec légende', () => {
    expect(parseWaMessage({ type: 'image', image: { id: 'M1', caption: ' rouge ' } })).toEqual({
      kind: 'image',
      mediaId: 'M1',
      caption: 'rouge',
    });
  });

  it('classe une image sans légende', () => {
    expect(parseWaMessage({ type: 'image', image: { id: 'M2' } })).toEqual({
      kind: 'image',
      mediaId: 'M2',
      caption: undefined,
    });
  });

  it('marque une image sans id comme non supportée', () => {
    expect(parseWaMessage({ type: 'image', image: {} })).toEqual({ kind: 'unsupported' });
  });

  it('classe audio / document / sticker / vidéo avec leur id', () => {
    expect(parseWaMessage({ type: 'audio', audio: { id: 'A1' } })).toEqual({ kind: 'audio', mediaId: 'A1' });
    expect(parseWaMessage({ type: 'document', document: { id: 'D1' } })).toEqual({ kind: 'document', mediaId: 'D1' });
    expect(parseWaMessage({ type: 'sticker', sticker: { id: 'S1' } })).toEqual({ kind: 'sticker', mediaId: 'S1' });
    expect(parseWaMessage({ type: 'video', video: { id: 'V1' } })).toEqual({ kind: 'video', mediaId: 'V1' });
  });

  it('marque les types inconnus comme non supportés', () => {
    expect(parseWaMessage({ type: 'reaction' })).toEqual({ kind: 'unsupported' });
    expect(parseWaMessage({ type: 'location' })).toEqual({ kind: 'unsupported' });
    expect(parseWaMessage({})).toEqual({ kind: 'unsupported' });
  });
});
