'use client';

import { CountryFlag } from './CountryFlag';
import { fig } from './theme';
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
    <div className="fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-lg sm:max-w-2xl lg:max-w-3xl px-2 sm:px-4">
        <div className="bg-[#1a0a0a]/95 backdrop-blur-xl border border-red-500/30 rounded-t-2xl shadow-[0_-8px_32px_rgba(127,29,29,0.5)] overflow-hidden">
          <button
            type="button"
            onClick={onToggle}
            className="w-full px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <span className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-red-600 text-white font-black flex items-center justify-center text-base sm:text-lg">
                {count}
              </span>
              <div className="text-left min-w-0">
                <p className="font-bold text-white text-sm truncate">Tu pedido de figuritas</p>
                <p className="text-xs text-red-200/50 truncate">
                  {count === 0 ? 'Tocá figuritas rojas para agregar' : `${count} en el carrito`}
                </p>
              </div>
            </div>
            <p className="text-lg sm:text-xl font-black text-red-300 shrink-0">{formatFiguritasMoney(total)}</p>
          </button>

          {expanded && (
            <div className="border-t border-red-900/50 max-h-[min(55vh,420px)] overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
              {lines.length === 0 ? (
                <p className="text-sm text-red-200/50 text-center py-4">
                  Todavía no elegiste ninguna figurita. Las disponibles brillan en rojo en el álbum.
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li
                        key={l.stickerId}
                        className="flex items-center gap-2 text-sm bg-red-950/40 border border-red-900/30 rounded-xl px-3 py-2"
                      >
                        <CountryFlag country={{ name: l.countryName, flag: l.flag, flagUrl: l.flagUrl }} size="sm" />
                        <span className="flex-1 truncate font-medium text-red-50 text-xs sm:text-sm">
                          {l.countryName}{' '}
                          <span className="text-red-300 font-mono">#{l.number}</span>
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSetQty(l.stickerId, l.qty - 1)}
                            className="w-7 h-7 rounded-lg bg-red-900/60 text-white font-bold touch-manipulation"
                          >
                            −
                          </button>
                          <span className="w-5 text-center font-bold text-sm">{l.qty}</span>
                          <button
                            type="button"
                            disabled={l.qty >= l.maxStock}
                            onClick={() => onSetQty(l.stickerId, l.qty + 1)}
                            className="w-7 h-7 rounded-lg bg-red-900/60 text-white font-bold disabled:opacity-40 touch-manipulation"
                          >
                            +
                          </button>
                        </div>
                        <span className="w-14 sm:w-16 text-right text-red-200 text-[10px] sm:text-xs font-semibold shrink-0">
                          {formatFiguritasMoney(l.priceUnit * l.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-red-200/60 uppercase tracking-wide">
                      Datos para el retiro
                    </p>
                    <input
                      type="text"
                      placeholder="Tu nombre *"
                      value={buyerName}
                      onChange={(e) => onName(e.target.value)}
                      className={fig.input}
                    />
                    <input
                      type="tel"
                      placeholder="WhatsApp / teléfono *"
                      value={buyerPhone}
                      onChange={(e) => onPhone(e.target.value)}
                      className={fig.input}
                    />
                    <input
                      type="text"
                      placeholder="Notas (ej. retiro sábado tarde)"
                      value={notes}
                      onChange={(e) => onNotes(e.target.value)}
                      className={fig.input}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting || !lines.length || !buyerName.trim() || !buyerPhone.trim()}
                    className={`w-full ${fig.btnPrimary}`}
                  >
                    {submitting ? 'Enviando pedido…' : 'Confirmar pedido de figuritas'}
                  </button>
                  <p className="text-[10px] text-center text-red-200/40">
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
