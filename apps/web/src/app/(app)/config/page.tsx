'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Business = {
  id: string;
  name: string;
  cuit?: string;
  address?: string;
  currency: string;
  posConfig?: {
    aiInvoice?: {
      n8nWebhookUrl?: string;
      publicApiUrl?: string;
      hasWebhookSecret?: boolean;
    };
  };
};

export default function ConfigPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', cuit: '', address: '' });
  const [aiForm, setAiForm] = useState({
    n8nWebhookUrl: '',
    publicApiUrl: '',
    newWebhookSecret: '',
    hasWebhookSecret: false,
  });
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Business>('/business/me'),
      api<{ id: string; name: string }[]>('/business/categories'),
    ]).then(([b, c]) => {
      setBusiness(b);
      setForm({ name: b.name, cuit: b.cuit || '', address: b.address || '' });
      const ai = b.posConfig?.aiInvoice;
      setAiForm({
        n8nWebhookUrl: ai?.n8nWebhookUrl ?? '',
        publicApiUrl: ai?.publicApiUrl ?? '',
        newWebhookSecret: '',
        hasWebhookSecret: !!ai?.hasWebhookSecret,
      });
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

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      const aiInvoice: {
        n8nWebhookUrl: string;
        publicApiUrl: string;
        webhookSecret?: string;
      } = {
        n8nWebhookUrl: aiForm.n8nWebhookUrl.trim(),
        publicApiUrl: aiForm.publicApiUrl.trim(),
      };
      if (aiForm.newWebhookSecret.trim()) {
        aiInvoice.webhookSecret = aiForm.newWebhookSecret.trim();
      }
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({ posConfig: { aiInvoice } }),
      });
      setBusiness(updated);
      setAiForm((f) => ({
        ...f,
        newWebhookSecret: '',
        hasWebhookSecret: !!updated.posConfig?.aiInvoice?.hasWebhookSecret,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingAi(false);
    }
  };

  const handleClearAiSecret = async () => {
    if (!confirm('¿Quitar el secreto guardado en la app? Se usará solo el del servidor (.env si existe).')) return;
    setSavingAi(true);
    try {
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({ clearAiInvoiceWebhookSecret: true }),
      });
      setBusiness(updated);
      setAiForm((f) => ({
        ...f,
        newWebhookSecret: '',
        hasWebhookSecret: !!updated.posConfig?.aiInvoice?.hasWebhookSecret,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingAi(false);
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

      <form
        onSubmit={handleSaveAi}
        className="space-y-4 rounded-lg border border-violet-800/50 bg-violet-950/20 p-6 mb-6"
      >
        <h2 className="font-medium text-violet-200">Compras con IA (N8N)</h2>
        <p className="text-slate-500 text-sm">
          Si N8N o el túnel cambian, podés actualizar la URL aquí sin tocar el servidor. Si no cargás nada, se usan
          las variables de entorno <code className="text-slate-400">N8N_INVOICE_WEBHOOK_URL</code> y{' '}
          <code className="text-slate-400">AI_INVOICE_WEBHOOK_SECRET</code>.
        </p>
        <div>
          <label className="block text-sm text-slate-400 mb-1">URL del webhook de N8N (entrada)</label>
          <input
            type="url"
            placeholder="https://…/webhook/…"
            value={aiForm.n8nWebhookUrl}
            onChange={(e) => setAiForm((f) => ({ ...f, n8nWebhookUrl: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-600"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">URL pública de esta API (callback para N8N)</label>
          <input
            type="url"
            placeholder="https://tu-api… o http://localhost:4002"
            value={aiForm.publicApiUrl}
            onChange={(e) => setAiForm((f) => ({ ...f, publicApiUrl: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-600"
          />
          <p className="text-xs text-slate-500 mt-1">
            Debe ser la base que N8N puede alcanzar (sin barra final). Si N8N está en la nube, hace falta túnel o
            dominio público.
          </p>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Secreto del callback (header X-Webhook-Secret)</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={aiForm.hasWebhookSecret ? 'Dejá vacío para no cambiar · escribí uno nuevo para reemplazar' : 'Mismo valor que usás en N8N al llamar a la API'}
            value={aiForm.newWebhookSecret}
            onChange={(e) => setAiForm((f) => ({ ...f, newWebhookSecret: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-600"
          />
          {aiForm.hasWebhookSecret && (
            <p className="text-xs text-emerald-500/90 mt-1">Hay un secreto guardado en la app.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={savingAi}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white disabled:opacity-50"
          >
            {savingAi ? 'Guardando…' : 'Guardar integración IA'}
          </button>
          {aiForm.hasWebhookSecret && (
            <button
              type="button"
              disabled={savingAi}
              onClick={handleClearAiSecret}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Quitar secreto guardado
            </button>
          )}
        </div>
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
