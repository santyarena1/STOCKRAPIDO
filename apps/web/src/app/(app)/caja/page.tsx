'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type CashRegister = {
  id: string;
  openingCash: string | number;
  closingCash?: string | number;
  openedAt: string;
  closedAt?: string;
  movements?: { id: string; type: string; amount: string | number; category?: string; note?: string; createdAt: string }[];
};

export default function CajaPage() {
  const [open, setOpen] = useState<CashRegister | null>(null);
  const [history, setHistory] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [movAmount, setMovAmount] = useState('');
  const [movType, setMovType] = useState<'income' | 'expense'>('income');
  const [movNote, setMovNote] = useState('');
  const [closeCounts, setCloseCounts] = useState([{ method: 'efectivo', expected: 0, actual: '' }]);
  const [closing, setClosing] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchOpen = async () => {
    try {
      const data = await api<CashRegister | null>('/caja/open');
      setOpen(data);
    } catch {
      setOpen(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (historyFrom) params.from = historyFrom;
      if (historyTo) params.to = historyTo;
      const data = await api<CashRegister[]>('/caja', { params });
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchOpen();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [historyFrom, historyTo]);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openingCash) || 0;
    if (amount < 0) return;
    try {
      await api('/caja/open', {
        method: 'POST',
        body: JSON.stringify({ openingCash: amount, notes: notes || undefined }),
      });
      setOpeningCash('');
      setNotes('');
      fetchOpen();
      fetchHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open) return;
    const amount = parseFloat(movAmount) || 0;
    if (amount <= 0) return;
    try {
      await api('/caja/movement', {
        method: 'POST',
        body: JSON.stringify({
          cashRegisterId: open.id,
          type: movType,
          amount: Math.abs(amount),
          note: movNote || undefined,
        }),
      });
      setMovAmount('');
      setMovNote('');
      fetchOpen();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open) return;
    setClosing(true);
    try {
      const counts = closeCounts.map((c) => ({
        method: c.method,
        expected: c.expected,
        actual: parseFloat(String(c.actual)) || 0,
      }));
      await api('/caja/close', {
        method: 'POST',
        body: JSON.stringify({ cashRegisterId: open.id, counts }),
      });
      setOpen(null);
      setCloseCounts([{ method: 'efectivo', expected: 0, actual: '' }]);
      fetchHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">Caja</h1>

      {!open ? (
        <form data-tour="caja-open" onSubmit={handleOpen} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 max-w-md">
          <h2 className="text-lg font-medium text-slate-200 mb-4">Abrir caja</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Monto inicial</label>
              <input
                type="number"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-lg bg-green-600 text-white font-medium">
              Abrir caja
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 flex justify-between items-center">
            <div>
              <p className="text-slate-400 text-sm">Caja abierta desde {new Date(open.openedAt).toLocaleString()}</p>
              <p className="text-xl font-bold text-white">Inicial: ${Number(open.openingCash).toFixed(0)}</p>
            </div>
          </div>

          <form data-tour="caja-movements" onSubmit={handleMovement} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="font-medium text-slate-200 mb-3">Ingreso / Egreso</h3>
            <div className="flex flex-wrap gap-2 items-end">
              <select
                value={movType}
                onChange={(e) => setMovType(e.target.value as 'income' | 'expense')}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              >
                <option value="income">Ingreso</option>
                <option value="expense">Egreso</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Monto"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
              <input
                type="text"
                placeholder="Nota"
                value={movNote}
                onChange={(e) => setMovNote(e.target.value)}
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white">
                Agregar
              </button>
            </div>
          </form>

          {open.movements && open.movements.length > 0 && (
            <div className="rounded-lg border border-slate-700 overflow-hidden">
              <h3 className="px-4 py-2 bg-slate-800 text-slate-200 font-medium">Movimientos</h3>
              <ul className="divide-y divide-slate-700">
                {open.movements.map((m) => (
                  <li key={m.id} className="px-4 py-2 flex justify-between text-sm">
                    <span className={m.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                      {m.type === 'income' ? '+' : '-'}${Math.abs(Number(m.amount)).toFixed(0)}
                    </span>
                    <span className="text-slate-500">{m.note || m.category || new Date(m.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form data-tour="caja-close" onSubmit={handleClose} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <h3 className="font-medium text-slate-200 mb-4">Cerrar caja</h3>
            <p className="text-slate-400 text-sm mb-4">Ingresá el monto contado por medio de pago:</p>
            {closeCounts.map((c, i) => (
              <div key={i} className="flex gap-2 items-center mb-2">
                <input
                  type="text"
                  value={c.method}
                  onChange={(e) =>
                    setCloseCounts((prev) => {
                      const n = [...prev];
                      n[i] = { ...n[i], method: e.target.value };
                      return n;
                    })
                  }
                  className="w-32 px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Contado real"
                  value={c.actual}
                  onChange={(e) =>
                    setCloseCounts((prev) => {
                      const n = [...prev];
                      n[i] = { ...n[i], actual: e.target.value };
                      return n;
                    })
                  }
                  className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCloseCounts((p) => [...p, { method: 'otro', expected: 0, actual: '' }])}
              className="text-sm text-sky-400 hover:underline mb-4"
            >
              + Otro medio
            </button>
            <button
              type="submit"
              disabled={closing}
              className="w-full py-2.5 rounded-lg bg-amber-600 text-white font-medium disabled:opacity-50"
            >
              {closing ? 'Cerrando...' : 'Cerrar caja'}
            </button>
          </form>
        </div>
      )}

      <div className="mt-10 rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-slate-200">Historial de aperturas y cierres</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
            />
            <span className="text-slate-500">a</span>
            <input
              type="date"
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
            />
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 disabled:opacity-50"
            >
              {historyLoading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 bg-slate-800/80 border-b border-slate-700">
                <th className="px-4 py-3">Apertura</th>
                <th className="px-4 py-3">Cierre</th>
                <th className="px-4 py-3 text-right">Inicial</th>
                <th className="px-4 py-3 text-right">Cierre</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-500 text-center">
                    Cargando historial...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-500 text-center">
                    No hay registros en el período seleccionado
                  </td>
                </tr>
              ) : (
                history.map((reg) => (
                  <tr key={reg.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-slate-300">
                      {new Date(reg.openedAt).toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {reg.closedAt
                        ? new Date(reg.closedAt).toLocaleString('es-AR')
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200">
                      ${Number(reg.openingCash).toFixed(0)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200">
                      {reg.closingCash != null
                        ? `$${Number(reg.closingCash).toFixed(0)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {reg.closedAt ? (
                        <span className="text-slate-400">Cerrada</span>
                      ) : (
                        <span className="text-green-400 font-medium">Abierta</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      {reg.movements?.length ?? 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
