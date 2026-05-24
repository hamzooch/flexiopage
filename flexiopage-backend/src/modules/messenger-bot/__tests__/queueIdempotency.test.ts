import { describe, it, expect } from 'vitest';
import { incomingJobId } from '../services/queue.service';

describe('incomingJobId', () => {
  it('utilise l’id du message Meta comme identifiant de job', () => {
    expect(incomingJobId({ messengerMessageId: 'wamid.ABC' })).toBe('wamid.ABC');
    expect(incomingJobId({ messengerMessageId: 'mid.123' })).toBe('mid.123');
  });

  it('retourne undefined quand l’id est absent (pas de dédup possible)', () => {
    expect(incomingJobId({ messengerMessageId: undefined })).toBeUndefined();
    expect(incomingJobId({ messengerMessageId: '' })).toBeUndefined();
  });
});
