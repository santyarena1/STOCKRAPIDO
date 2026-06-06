'use client';

import { CountryFlag } from './CountryFlag';
import { PublicContactActions } from './PublicContactActions';
import { fig } from './theme';
import type { CountryRow } from './types';

export function PublicHero({
  businessName,
  businessAddress,
  stats,
  onStart,
}: {
  businessName: string;
  businessAddress?: string | null;
  stats: { countries: number; availableUnits: number; availableSlots: number };
  onStart: () => void;
}) {
  return (
    <div className={fig.hero}>
      <div className={fig.heroGlowA} />
      <div className={fig.heroGlowB} />

      <div className="relative px-4 py-7 sm:px-8 sm:py-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl sm:text-2xl">🏆</span>
          <span className={fig.badge}>Mundial 2026</span>
        </div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight mb-2">
          Álbum de Figuritas
        </h1>
        <p className="text-red-100/85 text-sm sm:text-base max-w-lg mb-6">
          <strong className="text-white">{businessName}</strong> vende figuritas sueltas para que
          completes tu álbum. Elegí las que te faltan, armá tu pedido online y retirá en el local.
        </p>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-7 sm:mb-8 max-w-md">
          {[
            { v: stats.countries, l: 'Selecciones' },
            { v: stats.availableSlots, l: 'Figuritas' },
            { v: stats.availableUnits, l: 'En stock' },
          ].map((s) => (
            <div key={s.l} className={`${fig.cardInner} px-2 py-3 text-center`}>
              <p className={fig.statNum}>{s.v}</p>
              <p className={fig.statLabel}>{s.l}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 mb-7 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-200/80">
            ¿Cómo funciona?
          </p>
          <ol className="space-y-2.5 text-sm text-red-50/90">
            {[
              <>Elegí un <strong className="text-white">país / selección</strong> abajo</>,
              <>Tocá las figuritas <strong className="text-red-200">rojas</strong> (disponibles) para agregarlas</>,
              <>Enviá tu <strong className="text-white">pedido</strong> con tu nombre y WhatsApp</>,
            ].map((text, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="shrink-0 w-6 h-6 rounded-full bg-white text-red-700 font-bold text-xs flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mb-7 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-200/80 mb-3">
            Visitá el local
          </p>
          <PublicContactActions businessName={businessName} address={businessAddress} />
        </div>

        <button type="button" onClick={onStart} className={`w-full sm:w-auto ${fig.btnPrimary}`}>
          Ver figuritas disponibles →
        </button>
      </div>
    </div>
  );
}

export function CountryPicker({
  countries,
  selectedId,
  onSelect,
  variant = 'dark',
}: {
  countries: CountryRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  variant?: 'dark' | 'admin';
}) {
  const labelCls = variant === 'admin' ? 'text-red-200/60' : 'text-red-200/50';

  return (
    <div className="space-y-2">
      <p className={`text-xs font-semibold uppercase tracking-wider px-1 ${labelCls}`}>
        Elegí una selección
      </p>
      <div className="flex gap-2 sm:gap-2.5 overflow-x-auto pb-2 px-1 -mx-1 snap-x snap-mandatory">
        {countries.map((c) => {
          const avail = c.availableCount ?? c.stickers.filter((s) => s.stock > 0).length;
          const active = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              title={c.name}
              className={`snap-start shrink-0 flex flex-col items-center gap-1 px-2.5 py-2.5 sm:px-3 sm:py-3 rounded-xl border-2 transition-all w-[108px] sm:w-[120px] ${
                active ? fig.pickerActive : fig.pickerIdle
              }`}
            >
              <CountryFlag country={c} size="md" />
              <span className="text-[10px] sm:text-[11px] font-bold text-red-50 text-center leading-snug line-clamp-2 min-h-[2.4em] w-full">
                {c.name}
              </span>
              {c.code && (
                <span className="text-[9px] font-mono text-red-200/45">{c.code}</span>
              )}
              <span className={`text-[9px] font-medium ${avail > 0 ? 'text-red-300' : 'text-red-200/30'}`}>
                {avail} disp.
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
