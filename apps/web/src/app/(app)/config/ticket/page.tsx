'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { Business, useConfig } from '../config-context';

type ReceiptTemplate = 'clasico' | 'moderno';

export default function TicketConfigPage() {
  const { business, setBusiness } = useConfig();
  const [receiptName, setReceiptName] = useState('');
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>('clasico');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const branding = business?.posConfig?.branding;
    setReceiptName(branding?.receiptName ?? '');
    setReceiptTemplate(branding?.receiptTemplate === 'moderno' ? 'moderno' : 'clasico');
  }, [business]);

  const handleSaveTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({
          posConfig: {
            branding: {
              receiptName: receiptName.trim(),
              receiptTemplate,
            },
          },
        }),
      });
      setBusiness(updated);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
      alert('Configuración del ticket guardada.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al guardar el ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Ticket" subtitle="Personalizá el encabezado y el diseño del comprobante impreso." />
      <form onSubmit={handleSaveTicket} className="space-y-5 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Nombre de fantasía</label>
          <input
            type="text"
            value={receiptName}
            onChange={(event) => setReceiptName(event.target.value)}
            placeholder={business?.posConfig?.branding?.appTitle || business?.name || 'Nombre del comercio'}
            className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint focus-brand"
          />
          <p className="mt-1 text-xs text-fg-faint">Vacío = se usa el nombre de la app o el nombre del negocio.</p>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-medium text-fg-muted">Diseño del ticket</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${receiptTemplate === 'clasico' ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft' : 'border-hair bg-raised'}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-fg"><input type="radio" name="receiptTemplate" value="clasico" checked={receiptTemplate === 'clasico'} onChange={() => setReceiptTemplate('clasico')} />Clásico</span>
              <span className="mt-3 block bg-white p-3 font-mono text-[9px] text-black shadow-sm">
                <strong className="block text-center text-sm">MI COMERCIO</strong>
                <span className="block text-center">Razón Social · CUIT</span>
                <span className="my-2 block border-t border-dashed border-black" />
                2 x Producto........ $2.000
                <strong className="mt-2 block text-right">TOTAL $2.000</strong>
              </span>
            </label>
            <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${receiptTemplate === 'moderno' ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft' : 'border-hair bg-raised'}`}>
              <span className="flex items-center gap-2 text-sm font-medium text-fg"><input type="radio" name="receiptTemplate" value="moderno" checked={receiptTemplate === 'moderno'} onChange={() => setReceiptTemplate('moderno')} />Moderno</span>
              <span className="mt-3 block bg-white p-3 font-sans text-[9px] text-black shadow-sm">
                <strong className="block border-y-2 border-black py-1 text-center text-sm">MI COMERCIO</strong>
                <span className="mt-1 block text-center">Razón Social · CUIT</span>
                <span className="mt-2 grid grid-cols-[auto_1fr_auto] gap-1"><b>2</b><span>Producto</span><b>$2.000</b></span>
                <strong className="mt-2 block border-2 border-black p-1 text-center">TOTAL $2.000</strong>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="rounded-lg border border-hair bg-raised px-4 py-3 text-sm text-fg-muted">
          El logo del ticket usa el logo cargado en Apariencia.
        </div>
        <button type="submit" disabled={saving} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar configuración del ticket'}
        </button>
      </form>
    </div>
  );
}
