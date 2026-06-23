/**
 * MogaDelivery onboarding — automatise la création d'une Boutique côté MD
 * et la connexion de l'intégration FlexioPage→MD pour cette boutique.
 *
 * Deux endpoints exposés par MD (cf. memory `mogadelivery-multi-pays-architecture`) :
 *   POST {base}/boutiques                            → crée une Boutique pour un pays
 *   POST {base}/integrations/flexiopage/connect      → enregistre le webhook_secret
 *
 * Le secret est généré **côté FlexioPage** (64 chars hex via crypto.randomBytes)
 * et poussé chez MD. C'est nous qui détenons la source de vérité — MD se
 * contente de le stocker pour valider les signatures inbound.
 *
 * Auth : header `Authorization: Bearer <MOGADELIVERY_API_KEY>` (clé plateforme
 * négociée hors-API avec MD, posée en env). Si la clé est absente, les
 * fonctions throw et l'appelant doit retomber sur le mode manuel (UI propose
 * un secret généré localement à transmettre par mail).
 */
import crypto from 'crypto';

const DEFAULT_BASE = 'https://api.admin-mogadelivery.com/api';

function baseUrl(): string {
  return (process.env.MOGADELIVERY_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
}

function apiKey(): string {
  const k = process.env.MOGADELIVERY_API_KEY;
  if (!k) {
    throw new Error(
      'MOGADELIVERY_API_KEY manquante en env — onboarding auto indisponible. ' +
      'Demande la clé à MogaDelivery puis pose-la sur le serveur, ' +
      'sinon utilise le bouton "Générer + copier" côté admin pour le mode manuel.'
    );
  }
  return k;
}

/** Génère un secret HMAC 64-hex (32 octets) — la convention attendue côté MD. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface CreateBoutiqueInput {
  name: string;
  country: string;
  description?: string;
}
interface CreateBoutiqueResult {
  boutiqueId: string;
  raw: Record<string, unknown>;
}

/** Étape 1 : crée la Boutique chez MD pour un pays donné. */
export async function createBoutique(input: CreateBoutiqueInput): Promise<CreateBoutiqueResult> {
  const res = await fetch(`${baseUrl()}/boutiques`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      name: input.name,
      country: input.country.toUpperCase(),
      description: input.description || `Boutique FlexioPage · ${input.name}`,
    }),
  });
  const text = await res.text();
  const json = (() => {
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; }
  })();
  if (!res.ok) {
    const errMsg = typeof json.error === 'string' ? json.error : (text.slice(0, 200) || res.statusText);
    throw new Error(`MogaDelivery /boutiques ${res.status}: ${errMsg}`);
  }
  // MD peut renvoyer { id } ou { boutiqueId } selon version — on accepte les deux.
  const boutiqueId = String(json.boutiqueId || json.id || json._id || '');
  if (!boutiqueId) {
    throw new Error(`MogaDelivery /boutiques: réponse sans boutiqueId (${text.slice(0, 200)})`);
  }
  return { boutiqueId, raw: json };
}

interface ConnectIntegrationInput {
  boutiqueId: string;
  storeId: string;
  storeName: string;
  webhookSecret: string;
}
interface ConnectIntegrationResult {
  storeIdMD: string;
  raw: Record<string, unknown>;
}

/**
 * Étape 2 : connecte FlexioPage à la Boutique avec le secret généré.
 *
 * MD doit accepter un secret 64-hex. La doc disait que MD renvoie `storeIdMD`,
 * mais en pratique il peut être identique au `storeId` qu'on envoie (notre
 * ObjectId Mongo). On l'utilise tel que renvoyé pour le futur dispatch.
 */
export async function connectIntegration(input: ConnectIntegrationInput): Promise<ConnectIntegrationResult> {
  if (!/^[a-f0-9]{64}$/i.test(input.webhookSecret)) {
    throw new Error('webhookSecret doit être 64 caractères hexadécimaux');
  }
  const res = await fetch(`${baseUrl()}/integrations/flexiopage/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      boutiqueId: input.boutiqueId,
      storeId: input.storeId,
      storeName: input.storeName,
      webhookSecret: input.webhookSecret,
    }),
  });
  const text = await res.text();
  const json = (() => {
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; }
  })();
  if (!res.ok) {
    const errMsg = typeof json.error === 'string' ? json.error : (text.slice(0, 200) || res.statusText);
    throw new Error(`MogaDelivery /integrations/flexiopage/connect ${res.status}: ${errMsg}`);
  }
  // Le storeIdMD peut être renvoyé sous différents noms ou implicite (= storeId).
  const storeIdMD = String(json.storeIdMD || json.store_id || json.storeId || input.storeId);
  return { storeIdMD, raw: json };
}

interface OnboardStoreInput {
  storeId: string;
  storeName: string;
  country: string;
  description?: string;
}
interface OnboardStoreResult {
  boutiqueIdMD: string;
  storeIdMD: string;
  webhookSecret: string;
}

/**
 * Flux complet : crée la Boutique côté MD pour ce pays, génère un secret,
 * connecte l'intégration, renvoie de quoi peupler `store.markets[].delivery`
 * (ou `store.integrations.delivery` en mono-pays).
 */
export async function onboardStoreOnMogaDelivery(input: OnboardStoreInput): Promise<OnboardStoreResult> {
  const { boutiqueId } = await createBoutique({
    name: input.storeName,
    country: input.country,
    description: input.description,
  });
  const webhookSecret = generateWebhookSecret();
  const { storeIdMD } = await connectIntegration({
    boutiqueId,
    storeId: input.storeId,
    storeName: input.storeName,
    webhookSecret,
  });
  return { boutiqueIdMD: boutiqueId, storeIdMD, webhookSecret };
}

/** Indique si l'onboarding auto est disponible (clé API présente). */
export function isOnboardingAvailable(): boolean {
  return !!process.env.MOGADELIVERY_API_KEY;
}
