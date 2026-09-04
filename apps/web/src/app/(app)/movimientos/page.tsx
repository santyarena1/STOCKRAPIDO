'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';

type Move = {
  id: string;
  productId: string;
  qty: number;
  reason: string;
  reference?: string;
  createdAt: string;
  product: { name: string; barcode?: string };
};

export default function MovimientosPage() {
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  /** all = últimos movimientos de todo tipo; altas = solo productos nuevos (no quedan ocultos tras muchas ventas) */
  const [kind, setKind, kindReady] = usePersistedState<'all' | 'altas'>('sr-filters:movimientos:kind', 'altas');

  useEffect(() => {
    if (!kindReady) return;
    setLoading(true);
    api<Move[]>('/products/stock-moves', {
      params: {
        limit: kind === 'altas' ? '200' : '400',
        ...(kind === 'altas' ? { kind: 'altas' } : {}),
      },
    })
      .then((data) => setMoves(Array.isArray(data) ? data : []))
      .catch(() => setMoves([]))
      .finally(() => setLoading(false));
  }, [kindReady, kind]);

  const reasonLabel = (r: string) => STOCK_REASONS.find((x) => x.value === r)?.label ?? r;

  return (
    <Container className="space-y-6">
      <PageHeader title="Movimientos de stock" />
      <p className="text-fg-muted text-sm mb-4">
        Por defecto se muestran las <strong className="text-fg-muted">altas de producto</strong> (creaciones y stock
        inicial). En &quot;Todos&quot; ves ventas, compras y ajustes mezclados (lista global limitada: las ventas pueden
        ocultar altas antiguas).
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setKind('altas')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
            kind === 'altas'
              ? 'bg-[var(--ok-soft)] border-ok/30 text-ok'
              : 'border-hair-soft text-fg-muted hover:bg-raised'
          }`}
        >
          Altas de productos
        </button>
        <button
          type="button"
          onClick={() => setKind('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
            kind === 'all'
              ? 'bg-[var(--ok-soft)] border-ok/30 text-ok'
              : 'border-hair-soft text-fg-muted hover:bg-raised'
          }`}
        >
          Todos los movimientos
        </button>
      </div>

      {loading ? (
        <Loader />
      ) : (
        <div data-tour="movimientos-table" className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-faint bg-raised border-b border-hair-soft">
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right font-mono tabular-nums">Cantidad</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {moves.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-fg-faint text-center space-y-2">
                      <p>Sin movimientos registrados</p>
                      {kind === 'altas' && (
                        <p className="text-fg-faint text-xs max-w-md mx-auto">
                          Solo aparecen productos dados de alta con la versión actual del sistema. Las ventas no ocultan
                          esta lista.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(moves) ? moves : []).map((m) => (
                    <tr key={m.id} className="border-b border-hair-soft/50 hover:bg-raised">
                      <td className="px-4 py-2 text-fg-muted">
                        {new Date(m.createdAt).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/productos/${m.productId}`} className="text-brand hover:underline">
                          {m.product?.name ?? '-'}
                        </Link>
                        {m.product?.barcode && (
                          <span className="text-fg-faint text-xs block">{m.product.barcode}</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${m.qty > 0 ? 'text-ok' : m.qty < 0 ? 'text-crit' : 'text-fg-muted'}`}>
                        {m.reason === 'alta_producto' && m.qty === 0 ? '—' : `${m.qty >= 0 ? '+' : ''}${m.qty}`}
                      </td>
                      <td className="px-4 py-2 text-fg-muted">{reasonLabel(m.reason)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {moves.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-faint">Sin movimientos registrados</p>
            ) : moves.map((move) => (
              <article key={move.id} className="rounded-xl border border-hair-soft bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><Link href={`/productos/${move.productId}`} className="font-medium text-brand">{move.product?.name ?? '-'}</Link>{move.product?.barcode && <span className="block break-all font-mono text-xs text-fg-faint">{move.product.barcode}</span>}</div>
                  <span className={`shrink-0 font-mono font-semibold tabular-nums ${move.qty > 0 ? 'text-ok' : move.qty < 0 ? 'text-crit' : 'text-fg-muted'}`}>{move.reason === 'alta_producto' && move.qty === 0 ? '—' : `${move.qty >= 0 ? '+' : ''}${move.qty}`}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hair-soft pt-3 text-sm"><div><span className="block text-xs text-fg-faint">Fecha y hora</span><span className="font-mono text-xs text-fg-muted">{new Date(move.createdAt).toLocaleString('es-AR')}</span></div><div><span className="block text-xs text-fg-faint">Motivo</span><span className="text-fg-muted">{reasonLabel(move.reason)}</span></div></div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
