/**
 * Parsing pur d'un message entrant WhatsApp Cloud API (sans I/O, testable).
 *
 * Le webhook délègue ici la classification du type de message (texte, image,
 * audio, document, sticker, vidéo) pour garder le contrôleur fin et permettre
 * des tests unitaires sans base ni réseau.
 */
export interface WaMediaObj {
  id?: string;
  mime_type?: string;
  caption?: string;
}

export interface WaMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  image?: WaMediaObj;
  audio?: WaMediaObj;
  document?: WaMediaObj;
  sticker?: WaMediaObj;
  video?: WaMediaObj;
}

export type ParsedWa =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaId: string; caption?: string }
  | { kind: 'audio' | 'document' | 'sticker' | 'video'; mediaId?: string }
  | { kind: 'unsupported' };

/**
 * Classe un message WhatsApp entrant. Les types non gérés (réaction,
 * interactive, location, contacts, system, …) retournent `unsupported` → le
 * webhook les ignore.
 */
export function parseWaMessage(m: WaMessage): ParsedWa {
  switch (m.type) {
    case 'text': {
      const body = m.text?.body?.trim();
      return body ? { kind: 'text', text: body } : { kind: 'unsupported' };
    }
    case 'image':
      return m.image?.id
        ? { kind: 'image', mediaId: m.image.id, caption: m.image.caption?.trim() || undefined }
        : { kind: 'unsupported' };
    case 'audio':
      return { kind: 'audio', mediaId: m.audio?.id };
    case 'document':
      return { kind: 'document', mediaId: m.document?.id };
    case 'sticker':
      return { kind: 'sticker', mediaId: m.sticker?.id };
    case 'video':
      return { kind: 'video', mediaId: m.video?.id };
    default:
      return { kind: 'unsupported' };
  }
}
