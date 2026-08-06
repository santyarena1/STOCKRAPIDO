'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';

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
  const [kind, setKind] = useState<'all' | 'altas'>('altas');

  useEffect(() => {
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
  }, [kind]);

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
              : 'border-hair00 text-fg-muted hover:bg-raised'
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
              : 'border-hair00 text-fg-muted hover:bg-raised'
          }`}
        >
          Todos los movimientos
        </button>
      </div>

      {loading ? (
        <p className="text-fg-faint">Cargando...</p>
      ) : (
        <div data-tour="movimientos-table" className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-faint bg-raised border-b border-hair00">
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
                    <tr key={m.id} className="border-b border-hair00/50 hover:bg-raised">
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
        </div>
      )}
    </Container>
  );
}
