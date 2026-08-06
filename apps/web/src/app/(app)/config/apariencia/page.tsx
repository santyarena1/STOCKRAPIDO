'use client';

import { useEffect, useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { Business, useConfig } from '../config-context';

const DEFAULT_ACCENT = '#DC2626';
const OPTIONAL_BRAND_FIELDS = [
  { key: 'linkColor' as const, label: 'Enlaces y montos destacados', hint: 'Precios, links “Ver más”, totales en tablas. Vacío = color base.' },
  { key: 'primaryButtonColor' as const, label: 'Botones principales', hint: 'Guardar, Cobrar, Agregar, exportar, etc. Vacío = color base.' },
  { key: 'focusRingColor' as const, label: 'Foco en campos', hint: 'Anillo al hacer clic en inputs. Vacío = color base.' },
  { key: 'navActiveColor' as const, label: 'Menú lateral (ítem activo)', hint: 'Texto y borde de la sección actual. Vacío = color base.' },
  { key: 'selectionColor' as const, label: 'Listas y selección', hint: 'Fila resaltada en POS, compras, productos. Vacío = color base.' },
  { key: 'shadowTintColor' as const, label: 'Sombras y tutorial', hint: 'Resaltado del tour guiado y sombras suaves. Vacío = color base.' },
];

type BrandForm = { appTitle: string; accentColor: string; linkColor: string; primaryButtonColor: string; focusRingColor: string; navActiveColor: string; selectionColor: string; shadowTintColor: string; logoUrl: string; faviconUrl: string };
const EMPTY_BRAND: BrandForm = { appTitle: '', accentColor: DEFAULT_ACCENT, linkColor: '', primaryButtonColor: '', focusRingColor: '', navActiveColor: '', selectionColor: '', shadowTintColor: '', logoUrl: '', faviconUrl: '' };

function fromBusiness(business: Business | null): BrandForm {
  const br = business?.posConfig?.branding;
  return { appTitle: br?.appTitle ?? '', accentColor: br?.accentColor?.trim() || DEFAULT_ACCENT, linkColor: br?.linkColor?.trim() ?? '', primaryButtonColor: br?.primaryButtonColor?.trim() ?? '', focusRingColor: br?.focusRingColor?.trim() ?? '', navActiveColor: br?.navActiveColor?.trim() ?? '', selectionColor: br?.selectionColor?.trim() ?? '', shadowTintColor: br?.shadowTintColor?.trim() ?? '', logoUrl: br?.logoUrl ?? '', faviconUrl: br?.faviconUrl ?? '' };
}

function BrandColorRow({ label, hint, value, fallbackHex, onChange, onUseDefault }: { label: string; hint: string; value: string; fallbackHex: string; onChange: (value: string) => void; onUseDefault: () => void }) {
  const pickerSafe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallbackHex;
  return <div className="rounded-xl border border-hair-soft bg-raised p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium text-fg">{label}</p><p className="mt-0.5 text-xs text-fg-faint">{hint}</p></div><button type="button" onClick={onUseDefault} className="shrink-0 rounded border border-hair px-2 py-1 text-xs text-fg-muted hover:bg-raised2">Usar base</button></div><div className="mt-3 flex flex-wrap items-center gap-2"><input type="color" value={pickerSafe} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-hair bg-raised2" title={label} /><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#hex u otro CSS" className="min-w-[8rem] flex-1 rounded-lg border border-hair bg-raised2 px-3 py-2 font-mono text-sm text-fg" /></div></div>;
}

export default function AparienciaPage() {
  const { business, setBusiness } = useConfig();
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandForm, setBrandForm] = useState<BrandForm>(EMPTY_BRAND);
  useEffect(() => setBrandForm(fromBusiness(business)), [business]);
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingBrand(true);
    try {
      const updated = await api<Business>('/business/me', { method: 'PATCH', body: JSON.stringify({ posConfig: { branding: { appTitle: brandForm.appTitle.trim(), accentColor: brandForm.accentColor.trim() || DEFAULT_ACCENT, logoUrl: brandForm.logoUrl.trim(), faviconUrl: brandForm.faviconUrl.trim(), linkColor: brandForm.linkColor.trim(), primaryButtonColor: brandForm.primaryButtonColor.trim(), focusRingColor: brandForm.focusRingColor.trim(), navActiveColor: brandForm.navActiveColor.trim(), selectionColor: brandForm.selectionColor.trim(), shadowTintColor: brandForm.shadowTintColor.trim() } } }) });
      setBusiness(updated); setBrandForm(fromBusiness(updated));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
    } catch (err) { alert(err instanceof Error ? err.message : 'Error'); } finally { setSavingBrand(false); }
  };
  return <div className="space-y-6"><PageHeader title="Apariencia" subtitle="Personalizá la identidad visual del sistema." />
    <form data-tour="config-apariencia" onSubmit={handleSaveBranding} className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
      <p className="text-sm text-fg-muted">Nombre e icono en la barra lateral. El <strong className="text-fg">color base</strong> aplica a toda la app si no definís colores por zona abajo. El nombre legal del negocio sigue en “Datos del negocio”.</p>
      <div><label className="mb-1 block text-sm text-fg-muted">Nombre en la app (barra lateral)</label><input type="text" placeholder={business?.name ?? 'Ej. Mi negocio'} value={brandForm.appTitle} onChange={(e) => setBrandForm((f) => ({ ...f, appTitle: e.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint" /><p className="mt-1 text-xs text-fg-faint">Vacío = se usa el nombre del negocio.</p></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Color base (acento)</label><div className="flex flex-wrap items-center gap-2"><input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(brandForm.accentColor) ? brandForm.accentColor : DEFAULT_ACCENT} onChange={(e) => setBrandForm((f) => ({ ...f, accentColor: e.target.value }))} className="h-10 w-14 cursor-pointer rounded border border-hair bg-raised" title="Color base" /><input type="text" value={brandForm.accentColor} onChange={(e) => setBrandForm((f) => ({ ...f, accentColor: e.target.value }))} placeholder="#DC2626" className="w-40 rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg" /></div></div>
      <div className="space-y-3"><h3 className="text-sm font-medium text-fg">Colores por zona (opcional)</h3><p className="text-xs text-fg-faint">Dejá vacío cada campo o pulsá “Usar base” para tomar el color base. Así podés afinar textos, sombras y botones por separado.</p><div className="grid gap-3">{OPTIONAL_BRAND_FIELDS.map(({ key, label, hint }) => <BrandColorRow key={key} label={label} hint={hint} value={brandForm[key]} fallbackHex={/^#[0-9A-Fa-f]{6}$/.test(brandForm.accentColor) ? brandForm.accentColor : DEFAULT_ACCENT} onChange={(value) => setBrandForm((f) => ({ ...f, [key]: value }))} onUseDefault={() => setBrandForm((f) => ({ ...f, [key]: '' }))} />)}</div></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Icono del sidebar</label><ImageUploader value={brandForm.logoUrl} onChange={(url) => setBrandForm((f) => ({ ...f, logoUrl: url }))} maxPx={512} quality={0.9} previewClass="h-10 w-10 object-cover" label="Subir icono" /><p className="mt-2 text-xs text-fg-faint">PNG/JPEG/WebP. Cualquier tamaño — se optimiza automáticamente.</p></div>
      <div><label className="mb-1 block text-sm text-fg-muted">Favicon</label><ImageUploader value={brandForm.faviconUrl} onChange={(url) => setBrandForm((f) => ({ ...f, faviconUrl: url }))} maxPx={512} quality={0.9} previewClass="h-10 w-10 object-cover" label="Subir favicon" /><p className="mt-2 text-xs text-fg-faint">Ícono que se ve en la pestaña del navegador (favicon).</p></div>
      <button type="submit" disabled={savingBrand} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{savingBrand ? 'Guardando...' : 'Guardar apariencia'}</button>
    </form></div>;
}
