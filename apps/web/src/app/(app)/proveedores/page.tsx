'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Supplier = { id: string; name: string; phone?: string; email?: string; _count?: { purchases: number } };

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  useEffect(() => {
    api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => []).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined }),
      });
      setForm({ name: '', phone: '', email: '', address: '' });
      setShowForm(false);
      const list = await api<Supplier[]>('/suppliers');
      setSuppliers(list);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Proveedores</h1>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          data-tour="proveedores-nuevo"
          className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium"
        >
          {showForm ? 'Cerrar' : 'Nuevo proveedor'}
        </button>
      </div>

      {showForm && (
        <form data-tour="proveedores-form" onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6 max-w-md">
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
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <input
            type="text"
            placeholder="Dirección"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white">Guardar</button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="proveedores-list" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-left p-3">Email</th>
                <th className="text-right p-3">Compras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/50">
                  <td className="p-3 text-slate-200">{s.name}</td>
                  <td className="p-3 text-slate-400">{s.phone || '-'}</td>
                  <td className="p-3 text-slate-400">{s.email || '-'}</td>
                  <td className="p-3 text-right text-slate-400">{s._count?.purchases ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
