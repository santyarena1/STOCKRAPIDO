'use client';

import { CountryFlag } from './CountryFlag';
import { StickerSlot } from './StickerSlot';
import type { CountryRow } from './types';
import { formatFiguritasMoney } from '@/lib/figuritas';

function unitPrice(c: CountryRow) {
  return Number(c.priceUnit) || 0;
}

type PublicSpreadProps = {
  mode: 'public';
  country: CountryRow;
  onlyAvailable: boolean;
  cartQty: Record<string, number>;
  onAdd: (stickerId: string) => void;
  onRemove: (stickerId: string) => void;
};

type AdminSpreadProps = {
  mode: 'admin';
  country: CountryRow;
  stocks: Record<string, number>;
  onStockChange: (stickerId: string, stock: number) => void;
  onQuickAdd: (stickerId: string, number: number) => void;
};

export function AlbumSpread(props: PublicSpreadProps | AdminSpreadProps) {
  const { country } = props;
  const stickers =
    props.mode === 'public' && props.onlyAvailable
      ? country.stickers.filter((s) => s.stock > 0)
      : country.stickers;

  const availableCount =
    country.availableCount ?? country.stickers.filter((s) => s.stock > 0).length;
  const totalSlots = country.stickers.length;
  const pct = totalSlots > 0 ? Math.round((availableCount / totalSlots) * 100) : 0;

  return (
    <section className="rounded-2xl overflow-hidden border border-amber-900/30 shadow-xl">
      {/* Encabezado del álbum — estilo página Panini */}
      <div className="relative bg-gradient-to-r from-[#0B3D2E] via-[#145A32] to-[#0B3D2E] px-4 py-5 sm:px-6">
        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.03)_8px,rgba(255,255,255,0.03)_16px)]" />
        <div className="relative flex items-center gap-4">
          <CountryFlag country={country} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/90 font-semibold">
              Selección · Mundial 2026
            </p>
            <h2 className="text-xl sm:text-2xl font-black text-white truncate">{country.name}</h2>
            {country.code && (
              <p className="text-xs text-emerald-200/70 font-mono">{country.code}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-emerald-200/80">Precio c/u</p>
            <p className="text-lg font-bold text-amber-300">{formatFiguritasMoney(unitPrice(country))}</p>
          </div>
        </div>
        <div className="relative mt-4">
          <div className="flex justify-between text-[11px] text-emerald-100/80 mb-1">
            <span>{availableCount} figuritas disponibles</span>
            <span>{totalSlots} en el álbum</span>
          </div>
          <div className="h-2 rounded-full bg-black/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Hoja del álbum — textura papel */}
      <div className="bg-[#F5F0E6] dark:bg-[#1a1814] p-4 sm:p-6 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_60%)]">
        {stickers.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            No hay figuritas disponibles en esta selección ahora.
          </p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
            {stickers.map((s) =>
              props.mode === 'public' ? (
                <StickerSlot
                  key={s.id}
                  mode="public"
                  number={s.number}
                  stock={s.stock}
                  inCart={props.cartQty[s.id] ?? 0}
                  price={unitPrice(country)}
                  onAdd={() => props.onAdd(s.id)}
                  onRemove={() => props.onRemove(s.id)}
                />
              ) : (
                <StickerSlot
                  key={s.id}
                  mode="admin"
                  number={s.number}
                  stock={props.stocks[s.id] ?? s.stock}
                  onChange={(v) => props.onStockChange(s.id, v)}
                  onQuickAdd={() => props.onQuickAdd(s.id, s.number)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
