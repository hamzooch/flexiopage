/**
 * Chiffrement des tokens d'accès aux pages Facebook (au repos en DB).
 *
 * AES-256-GCM via le module `crypto` natif de Node (authentifié — détecte
 * toute altération du ciphertext), plutôt que `crypto-js`. La clé vient de
 * `TOKEN_ENCRYPTION_KEY` (64 hex = 32 octets).
 *
 * Format stocké : `iv:authTag:ciphertext` (chaque segment en base64).
 */
import crypto from 'crypto';
import { logger } from '../../../lib/logger';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recommandé pour GCM

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
  // 64 caractères hex = 32 octets.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  // Repli : dérive une clé 32 octets via SHA-256 (permet une string libre en dev).
  if (raw) return crypto.createHash('sha256').update(raw).digest();
  throw new Error('TOKEN_ENCRYPTION_KEY manquant — impossible de chiffrer les tokens de page.');
}

export class EncryptionService {
  /** Chiffre une valeur en clair → `iv:tag:ciphertext` (base64). */
  encrypt(plain: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  /** Déchiffre une valeur produite par `encrypt`. Lève si altérée/invalide. */
  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = String(payload).split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Format de token chiffré invalide.');
    }
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  }

  /** Vrai si une clé valide est configurée (utile au boot/diagnostic). */
  isConfigured(): boolean {
    try {
      getKey();
      return true;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[messenger-bot] encryption non configuré');
      return false;
    }
  }
}

export const encryptionService = new EncryptionService();
