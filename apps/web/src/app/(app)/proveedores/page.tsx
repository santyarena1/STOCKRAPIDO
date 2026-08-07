'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

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
    <Container className="space-y-6">
      <PageHeader
        title="Proveedores"
        subtitle="Centralizá los datos y el historial de tus proveedores."
        actions={<button
          type="button"
          onClick={() => setShowForm(!showForm)}
          data-tour="proveedores-nuevo"
          className="px-4 py-2 rounded-lg btn-brand font-medium"
        >
          {showForm ? 'Cerrar' : 'Nuevo proveedor'}
        </button>}
      />

      {showForm && (
        <form data-tour="proveedores-form" onSubmit={handleSubmit} className="max-w-md space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
            required
          />
          <input
            type="text"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          />
          <input
            type="text"
            placeholder="Dirección"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          />
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">Guardar</button>
        </form>
      )}

      {loading ? (
        <Loader />
      ) : (
        <div data-tour="proveedores-list" className="overflow-x-auto rounded-xl border border-hair-soft bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-raised text-fg-muted">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-left p-3">Email</th>
                <th className="text-right p-3 font-mono tabular-nums">Compras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair-soft">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-raised">
                  <td className="p-3 text-fg">{s.name}</td>
                  <td className="p-3 text-fg-muted">{s.phone || '-'}</td>
                  <td className="p-3 text-fg-muted">{s.email || '-'}</td>
                  <td className="p-3 text-right text-fg-muted font-mono tabular-nums">{s._count?.purchases ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
