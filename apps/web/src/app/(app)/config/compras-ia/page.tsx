'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { Business, useConfig } from '../config-context';

export default function ComprasIaPage() {
  const { business, setBusiness } = useConfig();
  const [savingAi, setSavingAi] = useState(false);
  const [aiForm, setAiForm] = useState({ n8nWebhookUrl: '', publicApiUrl: '', newWebhookSecret: '', hasWebhookSecret: false });
  useEffect(() => {
    const ai = business?.posConfig?.aiInvoice;
    setAiForm({ n8nWebhookUrl: ai?.n8nWebhookUrl ?? '', publicApiUrl: ai?.publicApiUrl ?? '', newWebhookSecret: '', hasWebhookSecret: !!ai?.hasWebhookSecret });
  }, [business]);

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingAi(true);
    try {
      const aiInvoice: { n8nWebhookUrl: string; publicApiUrl: string; webhookSecret?: string } = { n8nWebhookUrl: aiForm.n8nWebhookUrl.trim(), publicApiUrl: aiForm.publicApiUrl.trim() };
      if (aiForm.newWebhookSecret.trim()) aiInvoice.webhookSecret = aiForm.newWebhookSecret.trim();
      const updated = await api<Business>('/business/me', { method: 'PATCH', body: JSON.stringify({ posConfig: { aiInvoice } }) });
      setBusiness(updated);
      setAiForm((f) => ({ ...f, newWebhookSecret: '', hasWebhookSecret: !!updated.posConfig?.aiInvoice?.hasWebhookSecret }));
    } catch (err) { alert(err instanceof Error ? err.message : 'Error'); } finally { setSavingAi(false); }
  };
  const handleClearAiSecret = async () => {
    if (!confirm('¿Quitar el secreto guardado en la app? Se usará solo el del servidor (.env si existe).')) return;
    setSavingAi(true);
    try {
      const updated = await api<Business>('/business/me', { method: 'PATCH', body: JSON.stringify({ clearAiInvoiceWebhookSecret: true }) });
      setBusiness(updated);
      setAiForm((f) => ({ ...f, newWebhookSecret: '', hasWebhookSecret: !!updated.posConfig?.aiInvoice?.hasWebhookSecret }));
    } catch (err) { alert(err instanceof Error ? err.message : 'Error'); } finally { setSavingAi(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Compras con IA (N8N)" subtitle="Configurá la integración que procesa comprobantes de compra." />
    <form onSubmit={handleSaveAi} className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
      <p className="text-sm text-fg-muted">Si N8N o el túnel cambian, podés actualizar la URL aquí sin tocar el servidor. Si no cargás nada, se usan las variables de entorno <code className="text-fg">N8N_INVOICE_WEBHOOK_URL</code> y <code className="text-fg">AI_INVOICE_WEBHOOK_SECRET</code>.</p>
      <div><label className="mb-1 block text-sm text-fg-muted">URL del webhook de N8N (entrada)</label><input type="url" placeholder="https://…/webhook/…" value={aiForm.n8nWebhookUrl} onChange={(e) => setAiForm((f) => ({ ...f, n8nWebhookUrl: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint" /></div>
      <div><label className="mb-1 block text-sm text-fg-muted">URL pública de esta API (callback para N8N)</label><input type="url" placeholder="https://stockrapido-api.vercel.app" value={aiForm.publicApiUrl} onChange={(e) => setAiForm((f) => ({ ...f, publicApiUrl: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint" /><p className="mt-1 text-xs text-fg-faint">Debe ser la base que N8N puede alcanzar (sin barra final). Si N8N está en la nube, hace falta túnel o dominio público.</p></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Secreto del callback (header X-Webhook-Secret)</label><input type="password" autoComplete="new-password" placeholder={aiForm.hasWebhookSecret ? 'Dejá vacío para no cambiar · escribí uno nuevo para reemplazar' : 'Mismo valor que usás en N8N al llamar a la API'} value={aiForm.newWebhookSecret} onChange={(e) => setAiForm((f) => ({ ...f, newWebhookSecret: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint" />{aiForm.hasWebhookSecret && <p className="mt-1 text-xs text-ok">Hay un secreto guardado en la app.</p>}</div>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={savingAi} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{savingAi ? 'Guardando…' : 'Guardar integración IA'}</button>{aiForm.hasWebhookSecret && <button type="button" disabled={savingAi} onClick={handleClearAiSecret} className="rounded-lg border border-hair px-4 py-2 text-fg-muted hover:bg-raised disabled:opacity-50">Quitar secreto guardado</button>}</div>
    </form>
  </div>;
}
