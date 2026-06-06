'use client';

import {
  FIGURITAS_WHATSAPP_DISPLAY,
  figuritasContactWhatsAppUrl,
  getFiguritasMapsUrl,
} from '@/lib/figuritas';
import { fig } from './theme';

export function PublicContactActions({
  businessName,
  address,
  compact = false,
}: {
  businessName: string;
  address?: string | null;
  compact?: boolean;
}) {
  const mapsUrl = getFiguritasMapsUrl(address);
  const waUrl = figuritasContactWhatsAppUrl(
    `Hola ${businessName}! Quiero consultar por figuritas del álbum Mundial.`,
  );

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {!compact && address?.trim() && (
        <p className="text-xs sm:text-sm text-red-100/70 flex items-start gap-2">
          <span className="shrink-0">📍</span>
          <span>{address.trim()}</span>
        </p>
      )}
      <div className={`flex ${compact ? 'flex-col sm:flex-row' : 'flex-col sm:flex-row'} gap-2 sm:gap-3`}>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors ${compact ? 'py-2.5 px-4' : 'py-3 px-5'}`}
          >
            <span aria-hidden>🗺️</span>
            Cómo llegar
          </a>
        )}
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-lg transition-colors ${compact ? 'py-2.5 px-4' : 'py-3 px-5'}`}
        >
          <span aria-hidden>💬</span>
          WhatsApp {FIGURITAS_WHATSAPP_DISPLAY}
        </a>
      </div>
    </div>
  );
}
