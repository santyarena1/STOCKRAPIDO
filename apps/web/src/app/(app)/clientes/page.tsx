'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Customer = { id: string; name: string; phone?: string; balance: string | number };

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [morosos, setMorosos] = useState<Customer[]>([]);
  const [totalFiado, setTotalFiado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  useEffect(() => {
    Promise.all([
      api<Customer[]>('/customers'),
      api<Customer[]>('/customers/morosos'),
      api<number>('/customers/total-fiado'),
    ]).then(([c, m, t]) => {
      setCustomers(c);
      setMorosos(m);
      setTotalFiado(Number(t));
    }).catch(() => []).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, phone: form.phone || undefined, notes: form.notes || undefined }),
      });
      setForm({ name: '', phone: '', notes: '' });
      setShowForm(false);
      const list = await api<Customer[]>('/customers');
      setCustomers(list);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFor) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;
    try {
      await api(`/customers/${paymentFor}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, note: paymentNote || undefined }),
      });
      setPaymentFor(null);
      setPaymentAmount('');
      setPaymentNote('');
      const [c, m, t] = await Promise.all([
        api<Customer[]>('/customers'),
        api<Customer[]>('/customers/morosos'),
        api<number>('/customers/total-fiado'),
      ]);
      setCustomers(c);
      setMorosos(m);
      setTotalFiado(Number(t));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Clientes / Fiados</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} data-tour="clientes-nuevo" className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
          {showForm ? 'Cerrar' : 'Nuevo cliente'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
          <h3 className="text-amber-400 font-medium">Morosos ({morosos.length})</h3>
          <p className="text-sm text-slate-400">Clientes con saldo pendiente</p>
        </div>
        <div data-tour="clientes-total" className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h3 className="text-slate-200 font-medium">Saldo total fiado</h3>
          <p className="text-2xl font-bold text-white">${totalFiado.toFixed(0)}</p>
        </div>
      </div>

      {showForm && (
        <form data-tour="clientes-form" onSubmit={handleCreate} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6 max-w-md">
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            required
          />
          <input
            type="text"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <input
            type="text"
            placeholder="Notas"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white">Guardar</button>
        </form>
      )}

      {paymentFor && (
        <form onSubmit={handlePayment} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">Registrar pago</h3>
            <input
              type="number"
              step="0.01"
              placeholder="Monto"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 mb-2"
            />
            <input
              type="text"
              placeholder="Nota"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentFor(null)} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300">Cancelar</button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-green-600 text-white">Registrar</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="clientes-cobrar" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-right p-3">Saldo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/50">
                  <td className="p-3 text-slate-200">{c.name}</td>
                  <td className="p-3 text-slate-400">{c.phone || '-'}</td>
                  <td className={`p-3 text-right ${Number(c.balance) > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    ${Number(c.balance).toFixed(0)}
                  </td>
                  <td className="p-3">
                    {Number(c.balance) > 0 && (
                      <button
                        type="button"
                        onClick={() => setPaymentFor(c.id)}
                        className="text-green-400 hover:underline text-xs"
                      >
                        Registrar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
