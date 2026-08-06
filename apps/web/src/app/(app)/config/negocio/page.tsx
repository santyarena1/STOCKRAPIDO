'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { useConfig } from '../config-context';

export default function NegocioPage() {
  const { business, setBusiness } = useConfig();
  const [form, setForm] = useState({ name: '', cuit: '', address: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (business) setForm({ name: business.name, cuit: business.cuit || '', address: business.address || '' });
  }, [business]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name, cuit: form.cuit || undefined, address: form.address || undefined }),
      });
      setBusiness((b) => (b ? { ...b, ...form } : null));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <PageHeader title="Datos del negocio" subtitle="Actualizá la información principal de tu comercio." />
    <form data-tour="config-negocio" onSubmit={handleSave} className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
      <div><label className="mb-1 block text-sm text-fg-muted">Nombre</label><input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
      <div><label className="mb-1 block text-sm text-fg-muted">CUIT</label><input type="text" value={form.cuit} onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Dirección</label><input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
      <p className="text-sm text-fg-faint">Moneda: {business?.currency ?? 'ARS'}</p>
      <button type="submit" disabled={saving} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
    </form>
  </div>;
}
