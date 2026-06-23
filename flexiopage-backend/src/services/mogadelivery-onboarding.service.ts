/**
 * MogaDelivery onboarding — automatise la création d'une Boutique côté MD
 * et la connexion de l'intégration FlexioPage→MD pour cette boutique.
 *
 * Deux endpoints exposés par MD :
 *   POST {base}/boutiques                            → crée une Boutique
 *     ↳ response : { success: true, data: { id, … } }
 *   POST {base}/integrations/flexiopage/connect      → enregistre le webhook_secret
 *     ↳ response : { success: true, integrationId }
 *
 * **Auth (confirmé MD 2026-06-23) : pas de clé plateforme M2M.** Les deux
 * endpoints attendent un JWT seller (Authorization: Bearer <jwt>) — celui
 * que le seller obtient en se loguant chez MD. On accepte donc :
 *   1. Un `sellerToken` passé en argument (préféré, scoped au seller)
 *   2. Sinon `MOGADELIVERY_API_KEY` env (placeholder pour un futur partner
 *      credential — MD a dit qu'ils peuvent en spec un si on en a besoin)
 *
 * Le webhookSecret est généré **côté FlexioPage** (64 chars hex via
 * crypto.randomBytes) et poussé chez MD via /connect — MD ne nous renvoie
 * jamais un secret existant (politique sécurité).
 */
import crypto from 'crypto';

const DEFAULT_BASE = 'https://api.admin-mogadelivery.com/api';

function baseUrl(): string {
  return (process.env.MOGADELIVERY_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
}

function resolveAuth(sellerToken?: string): string {
  const token = sellerToken?.trim() || process.env.MOGADELIVERY_API_KEY;
  if (!token) {
    throw new Error(
      "Authentification MogaDelivery manquante : passe le JWT seller MD dans " +
      "`sellerToken`, ou demande à MD un partner credential M2M et pose-le " +
      "en env (MOGADELIVERY_API_KEY). Sans token, l'onboarding auto est " +
      "indisponible — utilise le mode manuel (génération locale + copie)."
    );
  }
  return token;
}

/** Génère un secret HMAC 64-hex (32 octets) — la convention attendue côté MD. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface CreateBoutiqueInput {
  name: string;
  country: string;
  description?: string;
  /** JWT seller MD — auth scoped au compte du seller, pas plateforme. */
  sellerToken?: string;
}
interface CreateBoutiqueResult {
  boutiqueId: string;
  raw: Record<string, unknown>;
}

/** Étape 1 : crée la Boutique chez MD pour un pays donné.
 *
 *  Réponse MD attendue (confirmée 2026-06-23) :
 *    `{ success: true, data: { id: "<boutiqueId>", … } }`
 */
export async function createBoutique(input: CreateBoutiqueInput): Promise<CreateBoutiqueResult> {
  const res = await fetch(`${baseUrl()}/boutiques`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveAuth(input.sellerToken)}`,
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
  // Format MD officiel : { success, data: { id } }. On tolère aussi les
  // shapes plus anciens (id, boutiqueId à la racine) au cas où.
  const data = (json.data as Record<string, unknown> | undefined) || {};
  const boutiqueId = String(data.id || json.boutiqueId || json.id || '');
  if (!boutiqueId) {
    throw new Error(`MogaDelivery /boutiques: réponse sans data.id (${text.slice(0, 200)})`);
  }
  return { boutiqueId, raw: json };
}

interface ConnectIntegrationInput {
  boutiqueId: string;
  storeId: string;
  storeName: string;
  webhookSecret: string;
  /** JWT seller MD. */
  sellerToken?: string;
}
interface ConnectIntegrationResult {
  integrationId: string;
  /** MD n'expose pas de `storeIdMD` distinct ; on garde notre storeId comme
   *  identifiant côté outbound — c'est lui que MD utilise pour résoudre
   *  l'intégration en interne. */
  storeIdMD: string;
  raw: Record<string, unknown>;
}

/**
 * Étape 2 : connecte FlexioPage à la Boutique avec le secret généré.
 *
 * Réponse MD attendue (confirmée 2026-06-23) :
 *   `{ success: true, integrationId: "<id>" }`
 *
 * MD impose un `webhookSecret` 64-hex. Le secret n'est jamais relu par MD —
 * il est juste enregistré pour valider les signatures inbound futures.
 */
export async function connectIntegration(input: ConnectIntegrationInput): Promise<ConnectIntegrationResult> {
  if (!/^[a-f0-9]{64}$/i.test(input.webhookSecret)) {
    throw new Error('webhookSecret doit être 64 caractères hexadécimaux');
  }
  const res = await fetch(`${baseUrl()}/integrations/flexiopage/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveAuth(input.sellerToken)}`,
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
  const integrationId = String(json.integrationId || (json.data as Record<string, unknown> | undefined)?.id || '');
  if (!integrationId) {
    throw new Error(`MogaDelivery /connect: réponse sans integrationId (${text.slice(0, 200)})`);
  }
  return { integrationId, storeIdMD: input.storeId, raw: json };
}

interface OnboardStoreInput {
  storeId: string;
  storeName: string;
  country: string;
  description?: string;
  /** JWT seller MD. Si absent, on tente l'env (partner credential futur). */
  sellerToken?: string;
  /** Si la Boutique existe déjà côté MD, le seller fournit son id —
   *  on saute l'étape `/boutiques` et on passe direct à `/connect`. */
  existingBoutiqueId?: string;
}
interface OnboardStoreResult {
  boutiqueIdMD: string;
  storeIdMD: string;
  integrationId: string;
  webhookSecret: string;
}

/**
 * Flux complet : (1) crée la Boutique côté MD pour ce pays, (2) génère un
 * secret côté nous, (3) appelle /connect pour le poser chez MD. Renvoie de
 * quoi peupler `store.markets[].delivery` ou `store.integrations.delivery`.
 *
 * Cas `existingBoutiqueId` : utile pour resync une boutique déjà créée sur
 * MD (ex. Afrochance) — on saute l'étape 1 et on rotate juste le secret.
 */
export async function onboardStoreOnMogaDelivery(input: OnboardStoreInput): Promise<OnboardStoreResult> {
  let boutiqueId = input.existingBoutiqueId?.trim();
  if (!boutiqueId) {
    const created = await createBoutique({
      name: input.storeName,
      country: input.country,
      description: input.description,
      sellerToken: input.sellerToken,
    });
    boutiqueId = created.boutiqueId;
  }
  const webhookSecret = generateWebhookSecret();
  const { integrationId, storeIdMD } = await connectIntegration({
    boutiqueId,
    storeId: input.storeId,
    storeName: input.storeName,
    webhookSecret,
    sellerToken: input.sellerToken,
  });
  return { boutiqueIdMD: boutiqueId, storeIdMD, integrationId, webhookSecret };
}

/** Indique si l'onboarding auto est disponible (token disponible).
 *  Tient compte d'un sellerToken explicite ou de l'env (futur partner key). */
export function isOnboardingAvailable(sellerToken?: string): boolean {
  return !!(sellerToken?.trim() || process.env.MOGADELIVERY_API_KEY);
}
