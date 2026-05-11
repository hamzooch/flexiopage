/**
 * Country list shared by profile + store creation. Maps ISO-2 country codes
 * to their currency (ISO-3) and human label.
 *
 * Keep this in sync with the frontend copy under
 * boutshop-frontend/src/data/countries.ts.
 */
export interface CountryInfo {
  code: string;        // ISO 3166-1 alpha-2
  label: string;
  currency: string;    // ISO 4217
  /** Bucket used by the UI to group flags. */
  group: 'arab' | 'africa' | 'europe' | 'americas' | 'asia' | 'other';
}

export const COUNTRIES: CountryInfo[] = [
  // Monde arabe
  { code: 'SA', label: 'Saudi Arabia',      currency: 'SAR', group: 'arab' },
  { code: 'AE', label: 'UAE',               currency: 'AED', group: 'arab' },
  { code: 'EG', label: 'Egypt',             currency: 'EGP', group: 'arab' },
  { code: 'MA', label: 'Morocco',           currency: 'MAD', group: 'arab' },
  { code: 'TN', label: 'Tunisia',           currency: 'TND', group: 'arab' },
  { code: 'DZ', label: 'Algeria',           currency: 'DZD', group: 'arab' },
  { code: 'QA', label: 'Qatar',             currency: 'QAR', group: 'arab' },
  { code: 'KW', label: 'Kuwait',            currency: 'KWD', group: 'arab' },
  { code: 'BH', label: 'Bahrain',           currency: 'BHD', group: 'arab' },
  { code: 'OM', label: 'Oman',              currency: 'OMR', group: 'arab' },
  { code: 'JO', label: 'Jordan',            currency: 'JOD', group: 'arab' },
  { code: 'LB', label: 'Lebanon',           currency: 'LBP', group: 'arab' },
  { code: 'IQ', label: 'Iraq',              currency: 'IQD', group: 'arab' },
  { code: 'LY', label: 'Libya',             currency: 'LYD', group: 'arab' },
  { code: 'SD', label: 'Sudan',             currency: 'SDG', group: 'arab' },
  { code: 'YE', label: 'Yemen',             currency: 'YER', group: 'arab' },
  { code: 'MR', label: 'Mauritania',        currency: 'MRU', group: 'arab' },
  // Afrique (CFA + autres)
  { code: 'SN', label: 'Senegal',           currency: 'XOF', group: 'africa' },
  { code: 'CI', label: "Côte d'Ivoire",     currency: 'XOF', group: 'africa' },
  { code: 'BF', label: 'Burkina Faso',      currency: 'XOF', group: 'africa' },
  { code: 'ML', label: 'Mali',              currency: 'XOF', group: 'africa' },
  { code: 'NE', label: 'Niger',             currency: 'XOF', group: 'africa' },
  { code: 'TG', label: 'Togo',              currency: 'XOF', group: 'africa' },
  { code: 'BJ', label: 'Benin',             currency: 'XOF', group: 'africa' },
  { code: 'CM', label: 'Cameroon',          currency: 'XAF', group: 'africa' },
  { code: 'GA', label: 'Gabon',             currency: 'XAF', group: 'africa' },
  { code: 'CG', label: 'Congo',             currency: 'XAF', group: 'africa' },
  { code: 'CD', label: 'DR Congo',          currency: 'CDF', group: 'africa' },
  { code: 'NG', label: 'Nigeria',           currency: 'NGN', group: 'africa' },
  { code: 'GH', label: 'Ghana',             currency: 'GHS', group: 'africa' },
  { code: 'KE', label: 'Kenya',             currency: 'KES', group: 'africa' },
  { code: 'ZA', label: 'South Africa',      currency: 'ZAR', group: 'africa' },
  { code: 'ET', label: 'Ethiopia',          currency: 'ETB', group: 'africa' },
  // Europe
  { code: 'FR', label: 'France',            currency: 'EUR', group: 'europe' },
  { code: 'BE', label: 'Belgium',           currency: 'EUR', group: 'europe' },
  { code: 'DE', label: 'Germany',           currency: 'EUR', group: 'europe' },
  { code: 'ES', label: 'Spain',             currency: 'EUR', group: 'europe' },
  { code: 'IT', label: 'Italy',             currency: 'EUR', group: 'europe' },
  { code: 'PT', label: 'Portugal',          currency: 'EUR', group: 'europe' },
  { code: 'NL', label: 'Netherlands',       currency: 'EUR', group: 'europe' },
  { code: 'CH', label: 'Switzerland',       currency: 'CHF', group: 'europe' },
  { code: 'GB', label: 'United Kingdom',    currency: 'GBP', group: 'europe' },
  { code: 'TR', label: 'Turkey',            currency: 'TRY', group: 'europe' },
  // Amériques
  { code: 'US', label: 'United States',     currency: 'USD', group: 'americas' },
  { code: 'CA', label: 'Canada',            currency: 'CAD', group: 'americas' },
  { code: 'MX', label: 'Mexico',            currency: 'MXN', group: 'americas' },
  { code: 'BR', label: 'Brazil',            currency: 'BRL', group: 'americas' },
  // Asie
  { code: 'IN', label: 'India',             currency: 'INR', group: 'asia' },
  { code: 'CN', label: 'China',             currency: 'CNY', group: 'asia' },
  { code: 'JP', label: 'Japan',             currency: 'JPY', group: 'asia' },
  { code: 'ID', label: 'Indonesia',         currency: 'IDR', group: 'asia' },
  { code: 'MY', label: 'Malaysia',          currency: 'MYR', group: 'asia' },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Return the default currency for a country code (uppercase). undefined if unknown. */
export function currencyForCountry(code?: string): string | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase())?.currency;
}

export function isKnownCountry(code?: string): boolean {
  return !!code && BY_CODE.has(code.trim().toUpperCase());
}
