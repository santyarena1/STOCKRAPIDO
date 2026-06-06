'use client';

import { CountryFlag } from './CountryFlag';
import type { CountryRow } from './types';

export function PublicHero({
  businessName,
  stats,
  onStart,
}: {
  businessName: string;
  stats: { countries: number; availableUnits: number; availableSlots: number };
  onStart: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-[#0B3D2E] via-[#0f4d3a] to-[#062a1f] text-white shadow-2xl">
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-emerald-400/10 blur-2xl" />

      <div className="relative px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🏆</span>
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
            Mundial 2026
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black leading-tight mb-2">
          Álbum de Figuritas
        </h1>
        <p className="text-emerald-100/90 text-sm sm:text-base max-w-lg mb-6">
          <strong className="text-white">{businessName}</strong> vende figuritas sueltas para que
          completes tu álbum. Elegí las que te faltan, armá tu pedido online y retirá en el local.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-8 max-w-md">
          <div className="rounded-xl bg-black/20 border border-white/10 px-3 py-3 text-center">
            <p className="text-2xl font-black text-amber-300">{stats.countries}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-200/70">Selecciones</p>
          </div>
          <div className="rounded-xl bg-black/20 border border-white/10 px-3 py-3 text-center">
            <p className="text-2xl font-black text-amber-300">{stats.availableSlots}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-200/70">Figuritas</p>
          </div>
          <div className="rounded-xl bg-black/20 border border-white/10 px-3 py-3 text-center">
            <p className="text-2xl font-black text-amber-300">{stats.availableUnits}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-200/70">En stock</p>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
            ¿Cómo funciona?
          </p>
          <ol className="space-y-2 text-sm text-emerald-50/90">
            <li className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center">1</span>
              <span>Elegí un <strong className="text-white">país / selección</strong> abajo</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center">2</span>
              <span>Tocá las figuritas <strong className="text-amber-300">doradas</strong> (disponibles) para agregarlas</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center">3</span>
              <span>Enviá tu <strong className="text-white">pedido</strong> con tu nombre y WhatsApp</span>
            </li>
          </ol>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold text-sm shadow-lg hover:from-amber-300 hover:to-amber-400 transition-all active:scale-[0.98]"
        >
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
}: {
  countries: CountryRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
        Elegí una selección
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin px-1 -mx-1">
        {countries.map((c) => {
          const avail = c.availableCount ?? c.stickers.filter((s) => s.stock > 0).length;
          const active = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 transition-all min-w-[72px] ${
                active
                  ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
                  : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
              }`}
            >
              <CountryFlag country={c} size="md" />
              <span className="text-[10px] font-bold text-slate-200 truncate max-w-[64px]">
                {c.code ?? c.name.slice(0, 3)}
              </span>
              <span className={`text-[9px] font-medium ${avail > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {avail} disp.
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
