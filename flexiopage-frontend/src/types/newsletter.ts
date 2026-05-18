/**
 * Frontend types for the newsletter welcome popup & subscriber list.
 * Mirrors backend Subscriber.model and store.settings.newsletter.
 */

export interface NewsletterSettings {
  enabled?: boolean;
  headline?: string;
  subheadline?: string;
  ctaLabel?: string;
  image?: string;
  delaySeconds?: number;
  exitIntent?: boolean;
  rewardCouponCode?: string;
  dismissalDays?: number;
  successMessage?: string;
}

export type SubscriberSource = 'newsletter_popup' | 'manual' | 'import';

export interface Subscriber {
  _id: string;
  storeId: string;
  email: string;
  source: SubscriberSource;
  rewardCouponCode?: string;
  name?: string;
  isUnsubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriberCounts {
  total: number;
  thisMonth: number;
}
