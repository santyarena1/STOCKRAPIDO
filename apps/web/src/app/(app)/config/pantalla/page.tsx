'use client';

import { useEffect, useState } from 'react';
import { ImageUploader, MultiImageUploader } from '@/components/ImageUploader';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { Business, useConfig } from '../config-context';

export default function PantallaPage() {
  const { business, setBusiness } = useConfig();
  const [savingCd, setSavingCd] = useState(false);
  const [cdForm, setCdForm] = useState({ mercadopagoAlias: '', mercadopagoQrUrl: '', promoImageUrls: [] as string[] });
  useEffect(() => { const cd = business?.posConfig?.customerDisplay; setCdForm({ mercadopagoAlias: cd?.mercadopagoAlias ?? '', mercadopagoQrUrl: cd?.mercadopagoQrUrl ?? '', promoImageUrls: Array.isArray(cd?.promoImageUrls) ? [...cd.promoImageUrls] : [] }); }, [business]);
  const handleSaveCustomerDisplay = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingCd(true);
    try {
      const updated = await api<Business>('/business/me', { method: 'PATCH', body: JSON.stringify({ posConfig: { customerDisplay: { mercadopagoAlias: cdForm.mercadopagoAlias.trim(), mercadopagoQrUrl: cdForm.mercadopagoQrUrl.trim(), promoImageUrls: cdForm.promoImageUrls } } }) });
      setBusiness(updated); const cd = updated.posConfig?.customerDisplay;
      setCdForm({ mercadopagoAlias: cd?.mercadopagoAlias ?? '', mercadopagoQrUrl: cd?.mercadopagoQrUrl ?? '', promoImageUrls: Array.isArray(cd?.promoImageUrls) ? [...cd.promoImageUrls] : [] });
    } catch (err) { alert(err instanceof Error ? err.message : 'Error'); } finally { setSavingCd(false); }
  };
  return <div className="space-y-6"><PageHeader title="Pantalla cliente" subtitle="Personalizá la vista que se muestra en el segundo monitor." />
    <form data-tour="config-pantalla-cliente" onSubmit={handleSaveCustomerDisplay} className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
      <p className="text-sm text-fg-muted">Desde el POS, botón <strong className="text-fg">VISTA CLIENTE</strong> abre esta vista en otra ventana. El cliente ve el carrito en tiempo real; al cobrar, aparece “Compra confirmada”. Cuando no hay venta, se muestran las promociones abajo.</p>
      <div><label className="mb-1 block text-sm text-fg-muted">Alias Mercado Pago</label><input type="text" placeholder="ej. tu.alias.mp" value={cdForm.mercadopagoAlias} onChange={(e) => setCdForm((f) => ({ ...f, mercadopagoAlias: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Imagen del QR Mercado Pago</label><ImageUploader value={cdForm.mercadopagoQrUrl} onChange={(url) => setCdForm((f) => ({ ...f, mercadopagoQrUrl: url }))} maxPx={800} quality={0.92} previewClass="h-24 w-24 object-contain bg-white p-1" label="Subir QR" /><p className="mt-2 text-xs text-fg-faint">PNG recomendado. Cualquier tamaño — se optimiza automáticamente.</p></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Imágenes promocionales (sin venta activa)</label><p className="mb-2 text-xs text-fg-faint">Hasta 12 imágenes; rotan cada unos segundos. Cualquier tamaño — se optimizan automáticamente.</p><MultiImageUploader values={cdForm.promoImageUrls} onChange={(urls) => setCdForm((f) => ({ ...f, promoImageUrls: urls }))} maxCount={12} maxPx={1400} /></div>
      <button type="submit" disabled={savingCd} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{savingCd ? 'Guardando…' : 'Guardar pantalla cliente'}</button>
    </form></div>;
}
