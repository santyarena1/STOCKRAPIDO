/** WhatsApp del kiosco para pedidos de figuritas */
export const FIGURITAS_WHATSAPP = '5491136012858';

export { getPublicFiguritasCatalogUrl } from './env-urls';

export function formatFiguritasMoney(value: number | string) {
  const n = Number(value);
  if (!isFinite(n)) return '$0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

export function countryFlag(country: { flag?: string | null; flagUrl?: string | null }) {
  if (country.flagUrl?.trim()) return null;
  return country.flag ?? '🏳️';
}

export function buildFiguritasOrderWhatsApp(params: {
  buyerName?: string | null;
  buyerPhone?: string | null;
  notes?: string | null;
  items: { qty: number; sticker: { number: number; country: { name: string; flag?: string | null } } }[];
  total?: number | string;
}) {
  const lines = ['Hola! Quiero consultar/completar mi pedido de figuritas:', ''];
  if (params.buyerName) lines.push(`Nombre: ${params.buyerName}`);
  if (params.buyerPhone) lines.push(`Tel: ${params.buyerPhone}`);
  lines.push('', 'Figuritas:');
  for (const item of params.items) {
    const f = item.sticker.country.flag ?? '';
    lines.push(`• ${f} ${item.sticker.country.name} #${item.sticker.number} ×${item.qty}`);
  }
  if (params.notes?.trim()) lines.push('', `Notas: ${params.notes.trim()}`);
  if (params.total != null) lines.push('', `Total estimado: ${formatFiguritasMoney(params.total)}`);
  return encodeURIComponent(lines.join('\n'));
}

export function whatsappUrl(text: string) {
  return `https://wa.me/${FIGURITAS_WHATSAPP}?text=${text}`;
}
