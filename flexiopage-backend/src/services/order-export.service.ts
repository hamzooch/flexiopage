/**
 * Export vendeur des commandes : Excel (.xlsx) ou CSV pour Google Sheets.
 * Une ligne par commande. Les filtres sont ceux de la liste (recherche,
 * statut, confirmation, dates).
 */
import ExcelJS from 'exceljs';
import type { IOrder } from '../models/Order.model';

export const ORDER_EXPORT_MAX = 5000;

const HEADERS = [
  'N° commande',
  'Date',
  'Client',
  'Téléphone',
  'WhatsApp',
  'Email',
  'Adresse',
  'Ville',
  'Région',
  'Code postal',
  'Pays',
  'Articles',
  'Quantité',
  'Sous-total',
  'Frais de livraison',
  'Remise',
  'Total',
  'Devise',
  'Statut paiement',
  'Moyen de paiement',
  'Confirmation',
  'Expédition',
  'Transporteur',
  'Statut livraison',
  'N° suivi',
  'Notes',
] as const;

const PAYMENT_STATUS: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payée',
  failed: 'Échouée',
  refunded: 'Remboursée',
  manual: 'Manuel',
  abandoned: 'Abandonnée',
};

const FULFILLMENT: Record<string, string> = {
  unfulfilled: 'Non expédiée',
  partial: 'Partielle',
  fulfilled: 'Expédiée',
  cancelled: 'Annulée',
};

const CONFIRMATION: Record<string, string> = {
  pending: 'À confirmer',
  confirmed: 'Confirmée',
  no_answer: 'Ne décroche pas',
  callback: 'À rappeler',
  declined: 'Refusée',
};

const PROVIDER: Record<string, string> = {
  cinetpay: 'CinetPay',
  paydunya: 'PayDunya',
  flutterwave: 'Flutterwave',
  moneróo: 'Moneroo',
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN Mobile Money',
  moov_money: 'Moov Money',
  stripe: 'Stripe',
  cod: 'Paiement à la livraison',
  manual: 'Virement / manuel',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  other: 'Autre',
  mogadelivery: 'MogaDelivery',
  bestdelivery: 'Best Delivery',
};

const DELIVERY_STATUS: Record<string, string> = {
  pending: 'En attente',
  assigned: 'Assignée',
  picked_up: 'Collectée',
  in_transit: 'En transit',
  delivered: 'Livrée',
  returned: 'Retournée',
  cancelled: 'Annulée',
  failed: 'Échec',
};

function label(map: Record<string, string>, value?: string | null): string {
  if (!value) return '';
  return map[value] || value;
}

function formatWhen(value: Date | string | undefined, timeZone: string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
}

export type ExportCell = string | number;

export function ordersToRows(orders: IOrder[], timeZone: string): ExportCell[][] {
  return orders.map((order) => {
    const address = order.shippingAddress;
    const qty = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const articles = order.items
      .map((item) => `${item.name} × ${item.quantity}${item.sku ? ` (${item.sku})` : ''}`)
      .join(' | ');
    const payment = order.paymentProvider || order.paymentMethod;
    return [
      order.orderNumber || '',
      formatWhen(order.createdAt, timeZone),
      order.customerName || '',
      order.customerPhone || '',
      order.customerWhatsapp || '',
      order.email || '',
      [address?.line1, address?.line2].filter(Boolean).join(', '),
      address?.city || '',
      address?.state || '',
      address?.postalCode || '',
      address?.country || '',
      articles,
      qty,
      order.subtotal ?? 0,
      order.shippingCost ?? 0,
      order.discount ?? 0,
      order.total ?? 0,
      order.currency || '',
      label(PAYMENT_STATUS, order.paymentStatus),
      label(PROVIDER, payment),
      label(CONFIRMATION, order.confirmationStatus || 'pending'),
      label(FULFILLMENT, order.fulfillmentStatus),
      label(PROVIDER, order.delivery?.provider),
      label(DELIVERY_STATUS, order.delivery?.externalStatus),
      order.trackingNumber || order.delivery?.externalId || '',
      [order.notes, order.confirmationNote].filter(Boolean).join(' — '),
    ];
  });
}

function csvCell(value: ExportCell): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV UTF-8 avec BOM, séparateur virgule : Google Sheets l’importe tel quel. */
export function ordersToCsv(orders: IOrder[], timeZone: string): string {
  const lines = [HEADERS, ...ordersToRows(orders, timeZone)].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function ordersToXlsx(orders: IOrder[], timeZone: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlexioPage';
  const sheet = workbook.addWorksheet('Commandes');
  sheet.addRow([...HEADERS]);
  for (const row of ordersToRows(orders, timeZone)) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } };
  header.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const lastCol = sheet.getColumn(HEADERS.length).letter;
  sheet.autoFilter = { from: 'A1', to: `${lastCol}1` };
  HEADERS.forEach((headerText, index) => {
    const wide = headerText === 'Articles' || headerText === 'Adresse' || headerText === 'Notes';
    sheet.getColumn(index + 1).width = wide ? 42 : Math.min(28, Math.max(14, headerText.length + 2));
  });
  const money = ['Sous-total', 'Frais de livraison', 'Remise', 'Total'];
  HEADERS.forEach((name, index) => {
    if (!money.includes(name)) return;
    sheet.getColumn(index + 1).numFmt = '#,##0.00';
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
