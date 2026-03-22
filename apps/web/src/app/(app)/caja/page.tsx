'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type CajaPreview = {
  openingEfectivo: number;
  openingBanco: number;
  salesEfectivo: number;
  salesBanco: number;
  movEfectivoIncome: number;
  movEfectivoExpense: number;
  movBancoIncome: number;
  movBancoExpense: number;
  expectedEfectivo: number;
  expectedBanco: number;
};

type CashRegister = {
  id: string;
  openingCash: string | number;
  openingBank?: string | number;
  closingCash?: string | number;
  closingBank?: string | number;
  openedAt: string;
  closedAt?: string;
  movements?: {
    id: string;
    type: string;
    amount: string | number;
    category?: string | null;
    note?: string;
    createdAt: string;
  }[];
  preview?: CajaPreview;
};

export default function CajaPage() {
  const [open, setOpen] = useState<CashRegister | null>(null);
  const [history, setHistory] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [openingBank, setOpeningBank] = useState('0');
  const [notes, setNotes] = useState('');
  const [movAmount, setMovAmount] = useState('');
  const [movType, setMovType] = useState<'income' | 'expense'>('income');
  const [movChannel, setMovChannel] = useState<'efectivo' | 'banco'>('efectivo');
  const [movNote, setMovNote] = useState('');
  const [closeActualEfectivo, setCloseActualEfectivo] = useState('');
  const [closeActualBanco, setCloseActualBanco] = useState('');
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
    const cash = parseFloat(openingCash) || 0;
    const bank = parseFloat(openingBank) || 0;
    if (cash < 0 || bank < 0) return;
    try {
      await api('/caja/open', {
        method: 'POST',
        body: JSON.stringify({
          openingCash: cash,
          openingBank: bank,
          notes: notes || undefined,
        }),
      });
      setOpeningCash('');
      setOpeningBank('0');
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
          channel: movChannel,
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
      const ef = parseFloat(closeActualEfectivo);
      const bk = parseFloat(closeActualBanco);
      if (Number.isNaN(ef) || Number.isNaN(bk)) {
        alert('Ingresá el efectivo y el banco contados (podés usar 0).');
        setClosing(false);
        return;
      }
      await api('/caja/close', {
        method: 'POST',
        body: JSON.stringify({
          cashRegisterId: open.id,
          counts: [
            { channel: 'efectivo', actual: ef },
            { channel: 'banco', actual: bk },
          ],
        }),
      });
      setOpen(null);
      setCloseActualEfectivo('');
      setCloseActualBanco('');
      fetchHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setClosing(false);
    }
  };

  const preview = open?.preview;

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">Caja</h1>

      {!open ? (
        <form data-tour="caja-open" onSubmit={handleOpen} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 max-w-md">
          <h2 className="text-lg font-medium text-slate-200 mb-4">Abrir caja</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Efectivo inicial (en caja)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Posición banco / electrónica inicial (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingBank}
                onChange={(e) => setOpeningBank(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
              <p className="text-xs text-slate-500 mt-1">Ventas con tarjeta, transferencia o MP suman acá; el efectivo del POS suma al de caja.</p>
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
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 flex flex-wrap justify-between gap-4">
            <div>
              <p className="text-slate-400 text-sm">Caja abierta desde {new Date(open.openedAt).toLocaleString()}</p>
              <p className="text-xl font-bold text-white">
                Efectivo inicial: ${Number(open.openingCash).toFixed(0)}
                {' · '}
                Banco inicial: ${Number(open.openingBank ?? 0).toFixed(0)}
              </p>
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border border-slate-600 bg-slate-900/40 p-4 text-sm">
              <h3 className="font-medium text-slate-200 mb-2">Resumen del turno (esperado)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                <div>
                  <p className="text-slate-500 text-xs">Efectivo esperado</p>
                  <p className="text-lg font-semibold text-emerald-300">${preview.expectedEfectivo.toFixed(0)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ventas efectivo ${preview.salesEfectivo.toFixed(0)} · mov. {preview.movEfectivoIncome - preview.movEfectivoExpense >= 0 ? '+' : ''}
                    {(preview.movEfectivoIncome - preview.movEfectivoExpense).toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Banco / electrónico esperado</p>
                  <p className="text-lg font-semibold text-sky-300">${preview.expectedBanco.toFixed(0)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ventas (tarjeta/transf./MP) ${preview.salesBanco.toFixed(0)} · mov.{' '}
                    {(preview.movBancoIncome - preview.movBancoExpense).toFixed(0)}
                  </p>
                </div>
              </div>
            </div>
          )}

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
              <select
                value={movChannel}
                onChange={(e) => setMovChannel(e.target.value as 'efectivo' | 'banco')}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                title="Dónde impacta el movimiento"
              >
                <option value="efectivo">Caja (efectivo)</option>
                <option value="banco">Banco / electrónico</option>
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
                  <li key={m.id} className="px-4 py-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className={m.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                      {m.type === 'income' ? '+' : '-'}${Math.abs(Number(m.amount)).toFixed(0)}
                    </span>
                    <span className="text-slate-400">
                      {m.category === 'banco' ? 'Banco' : 'Efectivo'}
                    </span>
                    <span className="text-slate-500">{m.note || new Date(m.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form data-tour="caja-close" onSubmit={handleClose} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <h3 className="font-medium text-slate-200 mb-2">Cerrar caja</h3>
            <p className="text-slate-400 text-sm mb-4">
              Contá por separado el efectivo físico y lo que corresponde a banco/tarjetas (según tu criterio de cierre).
            </p>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Efectivo contado
                  {preview != null && (
                    <span className="text-slate-500"> · Esperado ${preview.expectedEfectivo.toFixed(0)}</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closeActualEfectivo}
                  onChange={(e) => setCloseActualEfectivo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Banco / electrónicos contados
                  {preview != null && (
                    <span className="text-slate-500"> · Esperado ${preview.expectedBanco.toFixed(0)}</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closeActualBanco}
                  onChange={(e) => setCloseActualBanco(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                  placeholder="0"
                  required
                />
              </div>
            </div>
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
                <th className="px-4 py-3 text-right">Inicial E/B</th>
                <th className="px-4 py-3 text-right">Cierre E/B</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Mov.</th>
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
                      {reg.closedAt ? new Date(reg.closedAt).toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200 text-xs">
                      E ${Number(reg.openingCash).toFixed(0)} / B ${Number(reg.openingBank ?? 0).toFixed(0)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200 text-xs">
                      {reg.closedAt
                        ? `E $${Number(reg.closingCash ?? 0).toFixed(0)} / B $${Number(reg.closingBank ?? 0).toFixed(0)}`
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
