/**
 * Currencies offered when creating a trip.
 *
 * A curated list rather than a free-text field. Typed ISO codes invite `Rs`,
 * `rupees`, `inr `, and silent typos that produce a valid-looking but wrong
 * code — and because every expense stores a currency and an FX snapshot
 * (ADR-0005), a bad code corrupts every total on the trip. A select makes that
 * class of error impossible and is far easier to use on a phone.
 *
 * Ordered by likelihood for the initial audience, not alphabetically: the right
 * answer should usually be the first one.
 */
export interface CurrencyOption {
  readonly code: string;
  readonly label: string;
  readonly symbol: string;
}

export const CURRENCIES: readonly CurrencyOption[] = [
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'THB', label: 'Thai Baht', symbol: '฿' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'IDR', label: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'LKR', label: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'NPR', label: 'Nepalese Rupee', symbol: 'Rs' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', label: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'VND', label: 'Vietnamese Dong', symbol: '₫' },
];

export const DEFAULT_CURRENCY = 'INR';
