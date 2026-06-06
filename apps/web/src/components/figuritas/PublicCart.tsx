'use client';

import { CountryFlag } from './CountryFlag';
import type { CartLine } from './types';
import { formatFiguritasMoney } from '@/lib/figuritas';

export function PublicCart({
  lines,
  total,
  buyerName,
  buyerPhone,
  notes,
  submitting,
  expanded,
  onToggle,
  onSetQty,
  onName,
  onPhone,
  onNotes,
  onSubmit,
}: {
  lines: CartLine[];
  total: number;
  buyerName: string;
  buyerPhone: string;
  notes: string;
  submitting: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSetQty: (stickerId: string, qty: number) => void;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onNotes: (v: string) => void;
  onSubmit: () => void;
}) {
  const count = lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="fixed bottom-0 inset-x-0 z-30">
      <div className="mx-auto max-w-lg sm:max-w-2xl">
        <div className="bg-slate-900/95 backdrop-blur-xl border border-amber-500/30 rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
          <button
            type="button"
            onClick={onToggle}
            className="w-full px-5 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-lg">
                {count}
              </span>
              <div className="text-left">
                <p className="font-bold text-white text-sm">Tu pedido de figuritas</p>
                <p className="text-xs text-slate-400">
                  {count === 0 ? 'Tocá figuritas doradas para agregar' : `${count} en el carrito`}
                </p>
              </div>
            </div>
            <p className="text-xl font-black text-amber-400">{formatFiguritasMoney(total)}</p>
          </button>

          {expanded && (
            <div className="border-t border-slate-700 max-h-[55vh] overflow-y-auto px-5 py-4 space-y-4">
              {lines.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  Todavía no elegiste ninguna figurita. Las disponibles brillan en dorado en el álbum.
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li key={l.stickerId} className="flex items-center gap-2 text-sm bg-slate-800/60 rounded-lg px-3 py-2">
                        <CountryFlag country={{ name: l.countryName, flag: l.flag, flagUrl: l.flagUrl }} size="sm" />
                        <span className="flex-1 truncate font-medium text-slate-200">
                          {l.countryName} <span className="text-amber-400 font-mono">#{l.number}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => onSetQty(l.stickerId, l.qty - 1)} className="w-7 h-7 rounded-lg bg-slate-700 text-white font-bold">−</button>
                          <span className="w-6 text-center font-bold">{l.qty}</span>
                          <button
                            type="button"
                            disabled={l.qty >= l.maxStock}
                            onClick={() => onSetQty(l.stickerId, l.qty + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-700 text-white font-bold disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                        <span className="w-16 text-right text-amber-300/90 text-xs font-semibold">
                          {formatFiguritasMoney(l.priceUnit * l.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Datos para el retiro
                    </p>
                    <input
                      type="text"
                      placeholder="Tu nombre *"
                      value={buyerName}
                      onChange={(e) => onName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                    <input
                      type="tel"
                      placeholder="WhatsApp / teléfono *"
                      value={buyerPhone}
                      onChange={(e) => onPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                    <input
                      type="text"
                      placeholder="Notas (ej. retiro sábado tarde)"
                      value={notes}
                      onChange={(e) => onNotes(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting || !lines.length || !buyerName.trim() || !buyerPhone.trim()}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                  >
                    {submitting ? 'Enviando pedido…' : 'Confirmar pedido de figuritas'}
                  </button>
                  <p className="text-[10px] text-center text-slate-500">
                    Al confirmar, el local recibe tu pedido y te contacta para coordinar el pago y retiro.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
