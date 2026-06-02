/**
 * Schémas Zod pour valider les payloads des routes du bot.
 */
import { z } from 'zod';
import { isKnownCountry } from '../../../data/countries';

export const shippingFeeSchema = z.object({
  city: z.string().min(1).max(80),
  fee: z.number().min(0).max(100000),
});

export const customProductSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  price: z.number().min(0),
  image_url: z.string().url().optional(),
  stock: z.number().int().min(0).optional(),
  landing_url: z.string().max(500).optional(),
});

/** PUT /config — tous les champs optionnels (mise à jour partielle). */
export const updateConfigSchema = z.object({
  status: z.enum(['active', 'paused', 'disconnected']).optional(),
  language: z.enum(['ar', 'fr', 'en', 'darija_ma', 'darija_dz', 'darija_tn']).optional(),
  country: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine(isKnownCountry, { message: 'Pays non reconnu (code ISO-2 attendu).' })
    .optional(),
  welcome_message: z.string().max(2000).optional(),
  away_message: z.string().max(2000).optional(),
  order_confirmation_message: z.string().max(2000).optional(),
  shipping_fees: z.array(shippingFeeSchema).max(200).optional(),
  default_shipping_fee: z.number().min(0).max(100000).optional(),
  catalog_source: z.enum(['auto', 'manual', 'hybrid']).optional(),
  custom_products: z.array(customProductSchema).max(200).optional(),
  ai_personality: z.enum(['friendly', 'professional', 'energetic']).optional(),
  auto_create_order: z.boolean().optional(),
  ask_confirmation_before_order: z.boolean().optional(),
  notify_on_new_order: z.boolean().optional(),
  notification_email: z.string().email().optional().or(z.literal('')),
  notification_whatsapp: z.string().max(40).optional(),
});

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

/** POST /config/test */
export const testBotSchema = z.object({
  message: z.string().min(1).max(2000),
});

/** POST /facebook/connect — relie une page choisie. */
export const connectPageSchema = z.object({
  storeId: z.string().min(1),
  pageId: z.string().min(1),
  pageAccessToken: z.string().min(1),
  pageName: z.string().optional(),
  pagePictureUrl: z.string().url().optional(),
});

/** POST /conversations/:id/send */
export const sendManualSchema = z.object({
  message: z.string().min(1).max(2000),
});

/** POST /whatsapp/connect — connexion par token manuel (WhatsApp Cloud API). */
export const connectWhatsAppSchema = z.object({
  storeId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  wabaId: z.string().optional(),
  displayNumber: z.string().optional(),
});

/** POST /wasender/connect — crée une session WhatsApp via WasenderAPI. */
export const connectWasenderSchema = z.object({
  storeId: z.string().min(1),
  /** Personal Access Token Wasender (Settings → Personal Access Token). */
  personalAccessToken: z.string().min(1),
  /** Nom libre pour la session (utile dans le dashboard Wasender). */
  sessionName: z.string().min(1).max(80).optional(),
  /** Numéro WhatsApp affiché (optionnel, info). */
  phoneNumber: z.string().max(40).optional(),
});
