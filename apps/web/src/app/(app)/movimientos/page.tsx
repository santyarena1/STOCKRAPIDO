'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';

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

  useEffect(() => {
    api<Move[]>('/products/stock-moves', { params: { limit: '150' } })
      .then((data) => setMoves(Array.isArray(data) ? data : []))
      .catch(() => setMoves([]))
      .finally(() => setLoading(false));
  }, []);

  const reasonLabel = (r: string) => STOCK_REASONS.find((x) => x.value === r)?.label ?? r;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Movimientos de stock</h1>
      <p className="text-slate-400 text-sm mb-6">Historial de entradas y salidas de todos los productos</p>

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="movimientos-table" className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 bg-slate-800 border-b border-slate-700">
                  <th className="px-4 py-3">Fecha y hora</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {moves.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-slate-500 text-center">
                      Sin movimientos registrados
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(moves) ? moves : []).map((m) => (
                    <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(m.createdAt).toLocaleString('es-AR')}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/productos/${m.productId}`} className="text-sky-400 hover:underline">
                          {m.product?.name ?? '-'}
                        </Link>
                        {m.product?.barcode && (
                          <span className="text-slate-600 text-xs block">{m.product.barcode}</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${m.qty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {m.qty >= 0 ? '+' : ''}{m.qty}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{reasonLabel(m.reason)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
