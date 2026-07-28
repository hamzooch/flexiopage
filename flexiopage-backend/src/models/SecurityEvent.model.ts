/**
 * Security event — aggregated bucket of a suspicious activity pattern.
 *
 * We NEVER store one document per raw event: an attacker sending 10k reqs/s
 * would tank Mongo. Instead the security-monitor service maintains an in-memory
 * counter keyed on (type + sourceIP), flushes to this collection every 60s,
 * and uses `$inc` on `hits` to keep updating the same bucket while the attack
 * is ongoing. Each row therefore represents an entire "campaign" from a single
 * IP + type, with `firstSeen` / `lastSeen` bracketing when it happened.
 *
 * Retention: TTL 30 days on `lastSeen` — old buckets purge themselves.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type SecurityEventType =
  | 'cert_flood'          // Caddy cert-ask hit for unauthorized domains
  | 'rate_limit_hit'      // global rate limiter returned 429
  | 'auth_bruteforce'     // repeated failed login attempts
  | 'webhook_forged'      // signature/HMAC check failed on a payment webhook
  | 'suspicious_signup';  // spammy/scripted account creation

export interface ISecurityEvent extends Document {
  type: SecurityEventType;
  /** IP that originated the burst. `unknown` when we can't determine it. */
  sourceIp: string;
  /** Total count of raw events aggregated into this bucket. */
  hits: number;
  /** First and last time we saw this (type + sourceIp) pair. */
  firstSeen: Date;
  lastSeen: Date;
  /** A small sample payload (last one wins) for post-mortem inspection. */
  sample?: Record<string, unknown>;
  /** Optional short human note (e.g. domain requested for cert_flood). */
  target?: string;
  /** Was the operator notified for this bucket already? Anti-spam. */
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SecurityEventSchema = new Schema<ISecurityEvent>(
  {
    type: {
      type: String,
      enum: ['cert_flood', 'rate_limit_hit', 'auth_bruteforce', 'webhook_forged', 'suspicious_signup'],
      required: true,
      index: true,
    },
    sourceIp: { type: String, required: true, index: true },
    hits: { type: Number, default: 0 },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true, index: true },
    sample: { type: Schema.Types.Mixed },
    target: { type: String },
    notifiedAt: { type: Date },
  },
  { timestamps: true },
);

// TTL: 30 days after the last hit, the bucket auto-deletes.
SecurityEventSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
// One bucket per (type + IP) — the service upserts against this key.
SecurityEventSchema.index({ type: 1, sourceIp: 1 });

export const SecurityEvent = mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
