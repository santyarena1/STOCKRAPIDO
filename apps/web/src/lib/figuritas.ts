/** WhatsApp del kiosco para pedidos de figuritas (11 2779 1954) */
export const FIGURITAS_WHATSAPP = '5491127791954';
export const FIGURITAS_WHATSAPP_DISPLAY = '11 2779 1954';

export { getPublicFiguritasCatalogUrl } from './env-urls';

export function googleMapsSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/** Link a Maps: env fijo > búsqueda por dirección del negocio */
export function getFiguritasMapsUrl(address?: string | null): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_FIGURITAS_MAPS_URL?.trim();
  if (fromEnv) return fromEnv;
  if (address?.trim()) return googleMapsSearchUrl(address);
  return null;
}

export function figuritasContactWhatsAppUrl(
  message = 'Hola! Quiero consultar por figuritas del álbum Mundial.',
) {
  return `https://wa.me/${FIGURITAS_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

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
