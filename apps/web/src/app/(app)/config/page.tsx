'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Business = { id: string; name: string; cuit?: string; address?: string; currency: string };

export default function ConfigPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', cuit: '', address: '' });
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Business>('/business/me'),
      api<{ id: string; name: string }[]>('/business/categories'),
    ]).then(([b, c]) => {
      setBusiness(b);
      setForm({ name: b.name, cuit: b.cuit || '', address: b.address || '' });
      setCategories(c);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name, cuit: form.cuit || undefined, address: form.address || undefined }),
      });
      setBusiness((b) => (b ? { ...b, ...form } : null));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      const cat = await api<{ id: string; name: string }>('/business/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setCategories((c) => [...c, cat]);
      setNewCategory('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Configuración</h1>

      <form data-tour="config-negocio" onSubmit={handleSave} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6">
        <h2 className="font-medium text-slate-200">Datos del negocio</h2>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Nombre</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">CUIT</label>
          <input
            type="text"
            value={form.cuit}
            onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Dirección</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <p className="text-slate-500 text-sm">Moneda: {business?.currency ?? 'ARS'}</p>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </form>

      <div data-tour="config-categorias" className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="font-medium text-slate-200 mb-4">Categorías de productos</h2>
        <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Nueva categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white">Agregar</button>
        </form>
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="text-slate-300">{c.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
