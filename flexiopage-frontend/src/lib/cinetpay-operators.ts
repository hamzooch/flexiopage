/**
 * Opérateurs Mobile Money CinetPay, par pays.
 * Miroir de `PAYMENT_METHODS_BY_COUNTRY` dans cinetpay-js.
 * Le serveur revérifie le couple pays + méthode avant d'initier le paiement.
 */
export interface CinetpayOperator {
  id: string;
  label: string;
  mark: string;
  color: string;
  /** Texte sur le pastille. */
  ink: string;
}

const METHODS_BY_COUNTRY: Record<string, readonly string[]> = {
  CI: ['OM_CI', 'MOOV_CI', 'MTN_CI', 'WAVE_CI'],
  BF: ['OM_BF', 'MOOV_BF', 'WAVE_BF'],
  ML: ['OM_ML', 'MOOV_ML'],
  SN: ['OM_SN', 'FREE_SN', 'EXPRESSO_SN', 'WAVE_SN'],
  TG: ['MOOV_TG', 'TMONEY_TG'],
  GN: ['OM_GN', 'MTN_GN'],
  CM: ['OM_CM', 'MTN_CM'],
  BJ: ['MOOV_BJ', 'MTN_BJ'],
  CD: ['OM_CD', 'AIRTEL_CD', 'MPESA_CD', 'AFRICELL_CD'],
  NE: ['AIRTEL_NE', 'MOOV_NE', 'ZAMANI_NE'],
};

function brand(id: string): Omit<CinetpayOperator, 'id'> {
  if (id.startsWith('OM_')) return { label: 'Orange Money', mark: 'OM', color: '#ff6600', ink: '#fff' };
  if (id.startsWith('WAVE_')) return { label: 'Wave', mark: 'W', color: '#1dc8ff', ink: '#083344' };
  if (id.startsWith('MTN_')) return { label: 'MTN MoMo', mark: 'MTN', color: '#ffcc00', ink: '#1c1917' };
  if (id.startsWith('MOOV_')) return { label: 'Moov Money', mark: 'MV', color: '#0066b3', ink: '#fff' };
  if (id.startsWith('FREE_')) return { label: 'Free Money', mark: 'FM', color: '#e30613', ink: '#fff' };
  if (id.startsWith('EXPRESSO_')) return { label: 'Expresso', mark: 'EX', color: '#7ac143', ink: '#14532d' };
  if (id.startsWith('TMONEY_')) return { label: 'TMoney', mark: 'TM', color: '#ffd100', ink: '#1c1917' };
  if (id.startsWith('AIRTEL_')) return { label: 'Airtel Money', mark: 'AT', color: '#ed1c24', ink: '#fff' };
  if (id.startsWith('MPESA_')) return { label: 'M-Pesa', mark: 'MP', color: '#4caf50', ink: '#fff' };
  if (id.startsWith('AFRICELL_')) return { label: 'Africell', mark: 'AF', color: '#6b2d8b', ink: '#fff' };
  if (id.startsWith('ZAMANI_')) return { label: 'Zamani', mark: 'ZA', color: '#0b8f4d', ink: '#fff' };
  return { label: id, mark: '•', color: '#64748b', ink: '#fff' };
}

export function cinetpayOperators(country: string | undefined | null): CinetpayOperator[] {
  const ids = METHODS_BY_COUNTRY[(country || '').toUpperCase()] || [];
  return ids.map((id) => ({ id, ...brand(id) }));
}
