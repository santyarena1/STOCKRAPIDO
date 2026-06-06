'use client';

import { CountryFlag } from './CountryFlag';
import { StickerSlot } from './StickerSlot';
import { fig } from './theme';
import type { CountryRow } from './types';
import { stickerEffectivePrice } from './types';
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
    <section className={fig.albumBorder}>
      <div className={fig.albumHeader}>
        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.04)_8px,rgba(255,255,255,0.04)_16px)]" />
        <div className="relative flex items-center gap-3 sm:gap-4">
          <CountryFlag country={country} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-red-200/80 font-semibold">
              Selección · Mundial 2026
            </p>
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white leading-tight">{country.name}</h2>
            {country.code && <p className="text-[10px] sm:text-xs text-red-100/60 font-mono">{country.code}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] sm:text-xs text-red-100/70">Precio c/u</p>
            <p className="text-base sm:text-lg font-bold text-white">{formatFiguritasMoney(unitPrice(country))}</p>
          </div>
        </div>
        <div className="relative mt-3 sm:mt-4">
          <div className="flex justify-between text-[10px] sm:text-[11px] text-red-100/75 mb-1">
            <span>{availableCount} disponibles</span>
            <span>{totalSlots} en el álbum</span>
          </div>
          <div className={fig.progressTrack}>
            <div className={fig.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className={fig.albumSheet}>
        {stickers.length === 0 ? (
          <p className="text-center text-sm text-red-900/50 dark:text-red-200/40 py-8">
            No hay figuritas disponibles en esta selección ahora.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3">
            {stickers.map((s) =>
              props.mode === 'public' ? (
                <StickerSlot
                  key={s.id}
                  mode="public"
                  number={s.number}
                  stock={s.stock}
                  inCart={props.cartQty[s.id] ?? 0}
                  price={stickerEffectivePrice(s, unitPrice(country))}
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
