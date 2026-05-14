'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';

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
    branding?: {
      accentColor?: string;
      logoUrl?: string;
      appTitle?: string;
      linkColor?: string;
      primaryButtonColor?: string;
      focusRingColor?: string;
      navActiveColor?: string;
      selectionColor?: string;
      shadowTintColor?: string;
    };
    customerDisplay?: {
      mercadopagoAlias?: string;
      mercadopagoQrUrl?: string;
      promoImageUrls?: string[];
    };
  };
};

const DEFAULT_ACCENT = '#0ea5e9';

const OPTIONAL_BRAND_FIELDS = [
  {
    key: 'linkColor' as const,
    label: 'Enlaces y montos destacados',
    hint: 'Precios, links “Ver más”, totales en tablas. Vacío = color base.',
  },
  {
    key: 'primaryButtonColor' as const,
    label: 'Botones principales',
    hint: 'Guardar, Cobrar, Agregar, exportar, etc. Vacío = color base.',
  },
  {
    key: 'focusRingColor' as const,
    label: 'Foco en campos',
    hint: 'Anillo al hacer clic en inputs. Vacío = color base.',
  },
  {
    key: 'navActiveColor' as const,
    label: 'Menú lateral (ítem activo)',
    hint: 'Texto y borde de la sección actual. Vacío = color base.',
  },
  {
    key: 'selectionColor' as const,
    label: 'Listas y selección',
    hint: 'Fila resaltada en POS, compras, productos. Vacío = color base.',
  },
  {
    key: 'shadowTintColor' as const,
    label: 'Sombras y tutorial',
    hint: 'Resaltado del tour guiado y sombras suaves. Vacío = color base.',
  },
];

function BrandColorRow({
  label,
  hint,
  value,
  fallbackHex,
  onChange,
  onUseDefault,
}: {
  label: string;
  hint: string;
  value: string;
  fallbackHex: string;
  onChange: (v: string) => void;
  onUseDefault: () => void;
}) {
  const pickerSafe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallbackHex;
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onUseDefault}
          className="text-xs shrink-0 px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
        >
          Usar base
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          type="color"
          value={pickerSafe}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
          title={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#hex u otro CSS"
          className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 font-mono text-sm"
        />
      </div>
    </div>
  );
}

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
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingCd, setSavingCd] = useState(false);
  const [cdForm, setCdForm] = useState({
    mercadopagoAlias: '',
    mercadopagoQrUrl: '' as string,
    promoImageUrls: [] as string[],
  });
  const [brandForm, setBrandForm] = useState({
    appTitle: '',
    accentColor: DEFAULT_ACCENT,
    linkColor: '',
    primaryButtonColor: '',
    focusRingColor: '',
    navActiveColor: '',
    selectionColor: '',
    shadowTintColor: '',
    logoUrl: '' as string,
  });

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
      const br = b.posConfig?.branding;
      setBrandForm({
        appTitle: br?.appTitle ?? '',
        accentColor: br?.accentColor?.trim() || DEFAULT_ACCENT,
        linkColor: br?.linkColor?.trim() ?? '',
        primaryButtonColor: br?.primaryButtonColor?.trim() ?? '',
        focusRingColor: br?.focusRingColor?.trim() ?? '',
        navActiveColor: br?.navActiveColor?.trim() ?? '',
        selectionColor: br?.selectionColor?.trim() ?? '',
        shadowTintColor: br?.shadowTintColor?.trim() ?? '',
        logoUrl: br?.logoUrl ?? '',
      });
      const cd = b.posConfig?.customerDisplay;
      setCdForm({
        mercadopagoAlias: cd?.mercadopagoAlias ?? '',
        mercadopagoQrUrl: cd?.mercadopagoQrUrl ?? '',
        promoImageUrls: Array.isArray(cd?.promoImageUrls) ? [...cd.promoImageUrls] : [],
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
      }
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

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({
          posConfig: {
            branding: {
              appTitle: brandForm.appTitle.trim(),
              accentColor: brandForm.accentColor.trim() || DEFAULT_ACCENT,
              logoUrl: brandForm.logoUrl.trim(),
              linkColor: brandForm.linkColor.trim(),
              primaryButtonColor: brandForm.primaryButtonColor.trim(),
              focusRingColor: brandForm.focusRingColor.trim(),
              navActiveColor: brandForm.navActiveColor.trim(),
              selectionColor: brandForm.selectionColor.trim(),
              shadowTintColor: brandForm.shadowTintColor.trim(),
            },
          },
        }),
      });
      setBusiness(updated);
      const br = updated.posConfig?.branding;
      setBrandForm({
        appTitle: br?.appTitle ?? '',
        accentColor: br?.accentColor?.trim() || DEFAULT_ACCENT,
        linkColor: br?.linkColor?.trim() ?? '',
        primaryButtonColor: br?.primaryButtonColor?.trim() ?? '',
        focusRingColor: br?.focusRingColor?.trim() ?? '',
        navActiveColor: br?.navActiveColor?.trim() ?? '',
        selectionColor: br?.selectionColor?.trim() ?? '',
        shadowTintColor: br?.shadowTintColor?.trim() ?? '',
        logoUrl: br?.logoUrl ?? '',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleIconFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 240 * 1024) {
      alert('Elegí una imagen más chica (máx. ~240 KB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      setBrandForm((f) => ({ ...f, logoUrl: data }));
    };
    reader.readAsDataURL(file);
  };

  const handleCdQrFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 240 * 1024) {
      alert('El QR debe ser más chico (máx. ~240 KB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      setCdForm((f) => ({ ...f, mercadopagoQrUrl: data }));
    };
    reader.readAsDataURL(file);
  };

  const handleCdPromoFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    const remaining = 12 - cdForm.promoImageUrls.length;
    if (remaining <= 0) {
      alert('Máximo 12 imágenes de promoción.');
      return;
    }
    const toRead = files.slice(0, remaining);
    let idx = 0;
    const next: string[] = [...cdForm.promoImageUrls];
    const readOne = () => {
      if (idx >= toRead.length) {
        setCdForm((f) => ({ ...f, promoImageUrls: next }));
        return;
      }
      const file = toRead[idx];
      idx += 1;
      if (!file.type.startsWith('image/')) {
        readOne();
        return;
      }
      if (file.size > 240 * 1024) {
        alert(`"${file.name}" es demasiado grande (máx. ~240 KB).`);
        readOne();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = typeof reader.result === 'string' ? reader.result : '';
        if (data) next.push(data);
        readOne();
      };
      reader.readAsDataURL(file);
    };
    readOne();
  };

  const handleSaveCustomerDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCd(true);
    try {
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({
          posConfig: {
            customerDisplay: {
              mercadopagoAlias: cdForm.mercadopagoAlias.trim(),
              mercadopagoQrUrl: cdForm.mercadopagoQrUrl.trim(),
              promoImageUrls: cdForm.promoImageUrls,
            },
          },
        }),
      });
      setBusiness(updated);
      const cd = updated.posConfig?.customerDisplay;
      setCdForm({
        mercadopagoAlias: cd?.mercadopagoAlias ?? '',
        mercadopagoQrUrl: cd?.mercadopagoQrUrl ?? '',
        promoImageUrls: Array.isArray(cd?.promoImageUrls) ? [...cd.promoImageUrls] : [],
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingCd(false);
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
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg btn-brand disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </form>

      <form
        data-tour="config-apariencia"
        onSubmit={handleSaveBranding}
        className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6"
      >
        <h2 className="font-medium text-slate-200">Apariencia del sistema</h2>
        <p className="text-slate-500 text-sm">
          Nombre e icono en la barra lateral. El <strong className="text-slate-400">color base</strong> aplica a toda la app si no definís colores por zona abajo. El nombre legal del negocio sigue en “Datos del negocio”.
        </p>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Nombre en la app (barra lateral)</label>
          <input
            type="text"
            placeholder={business?.name ?? 'Ej. Mi negocio'}
            value={brandForm.appTitle}
            onChange={(e) => setBrandForm((f) => ({ ...f, appTitle: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-600"
          />
          <p className="text-xs text-slate-500 mt-1">Vacío = se usa el nombre del negocio.</p>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Color base (acento)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(brandForm.accentColor) ? brandForm.accentColor : DEFAULT_ACCENT}
              onChange={(e) => setBrandForm((f) => ({ ...f, accentColor: e.target.value }))}
              className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-slate-800"
              title="Color base"
            />
            <input
              type="text"
              value={brandForm.accentColor}
              onChange={(e) => setBrandForm((f) => ({ ...f, accentColor: e.target.value }))}
              placeholder="#0ea5e9"
              className="w-40 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">Colores por zona (opcional)</h3>
          <p className="text-xs text-slate-500">
            Dejá vacío cada campo o pulsá “Usar base” para tomar el color base. Así podés afinar textos, sombras y botones por separado.
          </p>
          <div className="grid gap-3 sm:grid-cols-1">
            {OPTIONAL_BRAND_FIELDS.map(({ key, label, hint }) => (
              <BrandColorRow
                key={key}
                label={label}
                hint={hint}
                value={brandForm[key]}
                fallbackHex={/^#[0-9A-Fa-f]{6}$/.test(brandForm.accentColor) ? brandForm.accentColor : DEFAULT_ACCENT}
                onChange={(v) => setBrandForm((f) => ({ ...f, [key]: v }))}
                onUseDefault={() => setBrandForm((f) => ({ ...f, [key]: '' }))}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Icono (sidebar y pestaña del navegador)</label>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(e) => handleIconFile(e.target.files)}
              className="text-sm text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200"
            />
            {brandForm.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandForm.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-600" />
            ) : (
              <span className="text-slate-500 text-sm">Sin icono personalizado</span>
            )}
            <button
              type="button"
              disabled={!brandForm.logoUrl || savingBrand}
              onClick={() => setBrandForm((f) => ({ ...f, logoUrl: '' }))}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Quitar icono
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            PNG/JPEG/WebP recomendado; máx. ~240 KB. También podés pegar una URL público https abajo.
          </p>
          <input
            type="url"
            placeholder="https://…/logo.png (opcional)"
            value={brandForm.logoUrl.startsWith('http') ? brandForm.logoUrl : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              setBrandForm((f) => ({ ...f, logoUrl: v }));
            }}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-600 text-sm"
          />
        </div>
        <button type="submit" disabled={savingBrand} className="px-4 py-2 rounded-lg btn-brand disabled:opacity-50">
          {savingBrand ? 'Guardando...' : 'Guardar apariencia'}
        </button>
      </form>

      <form
        data-tour="config-pantalla-cliente"
        onSubmit={handleSaveCustomerDisplay}
        className="space-y-4 rounded-lg border border-teal-800/40 bg-teal-950/15 p-6 mb-6"
      >
        <h2 className="font-medium text-teal-200">Pantalla cliente (segundo monitor)</h2>
        <p className="text-slate-500 text-sm">
          Desde el POS, botón <strong className="text-slate-400">VISTA CLIENTE</strong> abre esta vista en otra ventana. El cliente ve el carrito en tiempo real; al cobrar, aparece “Compra confirmada”. Cuando no hay venta, se muestran las promociones abajo.
        </p>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Alias Mercado Pago</label>
          <input
            type="text"
            placeholder="ej. tu.alias.mp"
            value={cdForm.mercadopagoAlias}
            onChange={(e) => setCdForm((f) => ({ ...f, mercadopagoAlias: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Imagen del QR Mercado Pago</label>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleCdQrFile(e.target.files)}
              className="text-sm text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200"
            />
            {cdForm.mercadopagoQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cdForm.mercadopagoQrUrl} alt="" className="h-24 w-24 rounded-lg object-contain bg-white p-1 border border-slate-600" />
            ) : (
              <span className="text-slate-500 text-sm">Sin QR cargado</span>
            )}
            <button
              type="button"
              disabled={!cdForm.mercadopagoQrUrl || savingCd}
              onClick={() => setCdForm((f) => ({ ...f, mercadopagoQrUrl: '' }))}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Quitar QR
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Imágenes promocionales (sin venta activa)</label>
          <p className="text-xs text-slate-500 mb-2">Hasta 12 imágenes; rotan cada unos segundos. PNG/JPEG ~240 KB c/u.</p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => handleCdPromoFiles(e.target.files)}
            className="text-sm text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200"
          />
          {cdForm.promoImageUrls.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {cdForm.promoImageUrls.map((url, i) => (
                <li key={i} className="relative group rounded-lg overflow-hidden border border-slate-600 aspect-video bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setCdForm((f) => ({
                        ...f,
                        promoImageUrls: f.promoImageUrls.filter((_, j) => j !== i),
                      }))
                    }
                    className="absolute top-1 right-1 w-7 h-7 rounded bg-black/70 text-white text-sm opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" disabled={savingCd} className="px-4 py-2 rounded-lg btn-brand disabled:opacity-50">
          {savingCd ? 'Guardando…' : 'Guardar pantalla cliente'}
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
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">Agregar</button>
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
