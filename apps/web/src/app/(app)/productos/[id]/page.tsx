'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';
import { BarcodeField } from '@/components/BarcodeField';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';
import { ImageUploader } from '@/components/ImageUploader';
import { SerperImagePicker } from '@/components/SerperImagePicker';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { Check, ChevronDown, Copy, Search } from 'lucide-react';
import { flattenRaw } from '@/lib/flatten-raw';

type ProductBatch = {
  id: string;
  qty: number;
  unitCost: string | number;
  expiresAt: string | null;
  createdAt: string;
};
type Product = {
  id: string;
  name: string;
  barcode?: string;
  price: string | number;
  cost?: string | number;
  stock: number;
  minStock: number;
  category?: { id: string; name: string };
  brand?: string;
  stockControl: boolean;
  expiresAt?: string | null;
  batches?: ProductBatch[];
  imageUrl?: string | null;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBox?: number | null;
  priceBox?: number | null;
  weight?: string | null;
  format?: string | null;
  flavor?: string | null;
  presentation?: string | null;
  subcategory?: string | null;
  eanBox?: string | null;
  supplierSku?: string | null;
  supplierRef?: string | null;
  externalId?: string | null;
  iva?: string | number | null;
  sourceProvider?: string | null;
  sourceConnectionId?: string | null;
  incomplete?: boolean;
  isActive?: boolean;
  silent?: boolean;
};
type Category = { id: string; name: string };
type StockMove = { id: string; qty: number; reason: string; reference?: string; createdAt: string };
type SupplierVariant = { id: string; uom: string; multiplier: number; skuId?: string | null; refId?: string | null; ean?: string | null; listPrice?: unknown; sellingPrice?: unknown; priceWithTax?: unknown; cost?: unknown; stock?: number | null; taxAlicuota?: unknown };
type SupplierHistory = { id: string; capturedAt: string; cost?: unknown; listPrice?: unknown; sellingPrice?: unknown };
type SyncedProduct = { id: string; provider?: string; name?: string; brand?: string | null; category?: string | null; subcategory?: string | null; ean?: string | null; eanUnit?: string | null; eanBox?: string | null; sku?: string | null; supplierRef?: string | null; externalId?: string | null; cost?: unknown; basePrice?: unknown; listPrice?: unknown; ivaAlicuota?: unknown; stock?: number | null; unitsPerBox?: string | null; unitsPerDisplay?: string | null; displaysPerBox?: string | null; retornable?: boolean | null; weight?: string | null; format?: string | null; flavor?: string | null; presentation?: string | null; imageUrl?: string | null; link?: string | null; raw?: unknown; connection: { id: string; provider: string; name: string }; variants: SupplierVariant[]; priceHistory: SupplierHistory[] };
type SupplierData = { linked: boolean; syncedProduct: SyncedProduct | null };

const displayValue = (value: unknown) => value == null || value === '' ? '—' : String(value);
const moneyValue = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—'
  : Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

function InfoCell({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const empty = value == null || value === '' || value === '—';
  return <div className="rounded-xl border border-hair-soft bg-raised p-3"><span className="block text-[10px] font-medium uppercase tracking-wide text-fg-faint">{label}</span><div className={`mt-1 break-words text-sm ${mono ? 'font-mono tabular-nums' : ''} ${empty ? 'text-fg-faint' : 'text-fg'}`}>{empty ? '—' : value}</div></div>;
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5"><h2 className="mb-4 text-base font-semibold text-fg">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
}

function SupplierRawData({ raw }: { raw: unknown }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const values = flattenRaw(raw);
  const term = query.trim().toLocaleLowerCase('es');
  const filtered = term ? values.filter((item) => item.path.toLocaleLowerCase('es').includes(term)) : values;
  const copy = async (key: string, value: unknown) => {
    await navigator.clipboard.writeText(String(value)); setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1200);
  };
  return <section className="overflow-hidden rounded-xl border border-hair-soft bg-surface"><button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"><div><h2 className="font-semibold text-fg">Todos los datos del proveedor</h2><p className="text-xs text-fg-muted">{values.length} valores del JSON original, sin recortar</p></div><ChevronDown className={`h-5 w-5 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="border-t border-hair-soft p-4 sm:p-5"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre de campo…" className="w-full rounded-xl border border-hair bg-raised py-2.5 pl-9 pr-3 text-sm text-fg focus-brand" /></label><div className="mt-4 space-y-2">{filtered.map((item, index) => { const key = `${item.path}-${index}`; return <div key={key} className="grid gap-2 rounded-lg border border-hair-soft bg-raised p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"><span className="break-all font-mono text-xs text-fg-muted">{item.path}</span><span className="break-all whitespace-pre-wrap font-mono text-xs text-fg">{String(item.value)}</span><button type="button" onClick={() => void copy(key, item.value)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-hair bg-raised2 px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg">{copied === key ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}Copiar</button></div>; })}{!filtered.length && <p className="py-8 text-center text-sm text-fg-faint">No hay campos que coincidan.</p>}</div></div>}</section>;
}

export default function EditarProductoPage() {
  const params = useParams();
  const id = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [supplierData, setSupplierData] = useState<SupplierData>({ linked: false, syncedProduct: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', barcode: '', categoryId: '', cost: '', price: '', minStock: '', brand: '', stockControl: true, silent: false, expiresAt: '', imageUrl: '', unitsPerBox: '', weight: '', format: '', flavor: '', presentation: '', subcategory: '' });
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [silentBusy, setSilentBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [extraOpen, setExtraOpen] = useState<Record<string, boolean>>({});

  const toggleSilent = async () => {
    if (!product || silentBusy) return;
    const next = !(product.silent ?? false);
    setSilentBusy(true);
    try {
      await api(`/products/${id}`, { method: 'PATCH', body: JSON.stringify({ silent: next }) });
      setProduct((p) => (p ? { ...p, silent: next } : p));
      setForm((f) => ({ ...f, silent: next }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSilentBusy(false);
    }
  };

  useEffect(() => {
    Promise.allSettled([
      api<Product | null>(`/products/${id}`),
      api<Category[]>('/business/categories'),
      api<StockMove[]>(`/products/${id}/stock-moves`),
      api<SupplierData>(`/products/${id}/supplier-data`),
    ]).then(([pRes, catsRes, mRes, supplierRes]) => {
      const p = pRes.status === 'fulfilled' ? pRes.value : null;
      const cats = catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : [];
      const m = mRes.status === 'fulfilled' && Array.isArray(mRes.value) ? mRes.value : [];
      const supplier = supplierRes.status === 'fulfilled' ? supplierRes.value : { linked: false, syncedProduct: null };
      if (p) {
        setProduct(p);
        setForm({
          name: p.name,
          barcode: p.barcode || '',
          categoryId: p.category?.id || '',
          cost: p.cost ? String(p.cost) : '',
          price: String(p.price),
          minStock: String(p.minStock),
          brand: p.brand || '',
          stockControl: p.stockControl,
          silent: p.silent ?? false,
          expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '',
          imageUrl: p.imageUrl || '',
          unitsPerBox: p.unitsPerBox || '',
          weight: p.weight || '',
          format: p.format || '',
          flavor: p.flavor || '',
          presentation: p.presentation || '',
          subcategory: p.subcategory || '',
        });
      }
      setCategories(cats);
      setMoves(m);
      setSupplierData(supplier);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api<Product>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          barcode: form.barcode || undefined,
          categoryId: form.categoryId || undefined,
          cost: form.cost ? parseFloat(form.cost) : undefined,
          price: parseFloat(form.price) || 0,
          minStock: parseInt(form.minStock, 10) || 0,
          brand: form.brand || undefined,
          stockControl: form.stockControl,
          silent: form.silent,
          expiresAt: form.expiresAt || undefined,
          imageUrl: form.imageUrl || null,
          unitsPerBox: form.unitsPerBox || undefined,
          weight: form.weight || undefined,
          format: form.format || undefined,
          flavor: form.flavor || undefined,
          presentation: form.presentation || undefined,
          subcategory: form.subcategory || undefined,
        }),
      });
      setProduct((current) => current ? { ...current, ...updated, category: updated.category ?? categories.find((c) => c.id === form.categoryId) ?? current.category } : updated);
      setSaveMsg('Guardado');
      window.setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(adjustQty, 10);
    if (!qty || !adjustReason.trim()) return;
    try {
      const updated = await api<Product>(`/products/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ qty, reason: adjustReason }),
      });
      setProduct(updated);
      setAdjustQty('');
      setAdjustReason('');
      const m = await api<StockMove[]>(`/products/${id}/stock-moves`);
      setMoves(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) return <Loader full />;
  if (!product) return (
    <div className="p-6">
      <Link href="/productos" className="text-brand hover:underline">← Productos</Link>
      <p className="mt-4 text-fg-muted">Producto no encontrado</p>
    </div>
  );

  const batches = product.batches ?? [];
  const nextExpiry = batches.length > 0
    ? batches.reduce<{ date: string; qty: number } | null>((acc, b) => {
        if (!b.expiresAt) return acc;
        const d = new Date(b.expiresAt).toISOString().slice(0, 10);
        if (!acc) return { date: d, qty: b.qty };
        if (d < acc.date) return { date: d, qty: b.qty };
        if (d === acc.date) return { date: acc.date, qty: acc.qty + b.qty };
        return acc;
      }, null)
    : null;
  const synced = supplierData.syncedProduct;

  return (
    <Container className="max-w-4xl space-y-6">
      <PageHeader title={product.name} actions={<Link href="/productos" className="text-fg-muted hover:text-fg">← Productos</Link>} />

      {/* Producto silencioso — arriba de todo */}
      <button
        type="button"
        onClick={() => void toggleSilent()}
        disabled={silentBusy}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition disabled:opacity-60 ${product.silent ? 'border-[color:var(--brand-accent)] bg-brand-highlight' : 'border-hair-soft bg-surface hover:bg-raised'}`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">Producto silencioso {product.silent && <span className="rounded-md border border-[color:var(--brand-accent)] bg-brand-highlight px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">PS</span>}</span>
          <span className="mt-0.5 block text-xs text-fg-faint">{product.silent ? 'En el ticket impreso sale con el texto configurado.' : 'En el ticket impreso sale con su nombre real.'}</span>
        </span>
        <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${product.silent ? 'bg-[color:var(--brand-accent)]' : 'bg-raised2'}`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${product.silent ? 'translate-x-5' : 'translate-x-1'}`} />
        </span>
      </button>

      <section className="overflow-hidden rounded-2xl border border-hair-soft bg-surface p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <div className="aspect-square overflow-hidden rounded-2xl border border-hair-soft bg-raised p-4">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-5xl font-bold text-fg-faint">{product.name.trim().slice(0, 2).toUpperCase()}</div>}</div>
          <div><div className="flex flex-wrap gap-2">{product.incomplete ? <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Incompleto</span> : <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Completo</span>}<span className={`rounded-md border px-2 py-1 text-xs ${product.isActive === false ? 'border-crit/30 bg-[var(--crit-soft)] text-crit' : 'border-ok/30 bg-[var(--ok-soft)] text-ok'}`}>{product.isActive === false ? 'Inactivo' : 'Activo'}</span></div><h1 className="mt-3 text-2xl font-bold text-fg">{product.name}</h1><p className="mt-1 text-sm text-fg-muted">{displayValue(product.brand)} · {displayValue(product.category?.name)} · {displayValue(product.subcategory)}</p><div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xl"><InfoCell label="Precio" value={moneyValue(product.price)} mono /><InfoCell label="Stock" value={`${product.stock} unidades`} mono /></div></div>
        </div>
      </section>


      <details className="rounded-xl border border-hair-soft bg-surface open:shadow-sm">
        <summary className="cursor-pointer list-none p-4 font-semibold text-fg sm:p-5 [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
          <span>Datos de lectura / proveedor</span>
          <ChevronDown className="h-5 w-5 text-fg-muted" />
        </summary>
        <div className="space-y-4 border-t border-hair-soft p-4 sm:p-5">
          <InfoSection title="Códigos">
            <InfoCell label="EAN unidad" value={displayValue(product.barcode)} mono />
            <InfoCell label="EAN bulto" value={displayValue(product.eanBox)} mono />
            <InfoCell label="SKU proveedor" value={displayValue(product.supplierSku)} mono />
            <InfoCell label="Ref. proveedor" value={displayValue(product.supplierRef)} mono />
            <InfoCell label="ID externo" value={displayValue(product.externalId)} mono />
          </InfoSection>
          <InfoSection title="Precios e IVA">
            <InfoCell label="Costo local" value={moneyValue(product.cost)} mono />
            <InfoCell label="Precio de venta" value={moneyValue(product.price)} mono />
            <InfoCell label="Precio base proveedor" value={moneyValue(synced?.basePrice)} mono />
            <InfoCell label="Precio lista proveedor" value={moneyValue(synced?.listPrice)} mono />
            <InfoCell label="IVA local" value={product.iva == null ? '—' : `${Number(product.iva)}%`} mono />
            <InfoCell label="IVA proveedor" value={synced?.ivaAlicuota == null ? '—' : `${Number(synced.ivaAlicuota)}%`} mono />
          </InfoSection>
          <section className="space-y-5 rounded-xl border border-hair-soft bg-raised p-4">
            <h2 className="text-base font-semibold text-fg">Origen / Proveedor</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoCell label="Proveedor de origen" value={displayValue(product.sourceProvider)} />
              <InfoCell label="Vínculo sincronizado" value={supplierData.linked ? 'Vinculado' : 'Sin vínculo'} />
              <InfoCell label="Conexión vinculada" value={displayValue(synced?.connection?.name)} />
            </div>
            {synced ? (
              <p className="text-sm text-fg-muted">Hay datos sincronizados. Abrí “Todos los datos del proveedor” más abajo para el JSON completo.</p>
            ) : (
              <p className="text-sm text-fg-muted">Este producto todavía no tiene datos sincronizados de un proveedor.</p>
            )}
          </section>
          {synced && <SupplierRawData raw={synced.raw} />}
        </div>
      </details>

      <div className="border-t border-hair-soft pt-2">
        <h2 className="text-xl font-semibold text-fg">Editar producto</h2>
        <p className="text-sm text-fg-muted">Lo frecuente arriba. Lo vacío o poco usado, en los desplegables.</p>
      </div>

      <div className="flex flex-col gap-6 pb-24">
        <form id="editar-producto-form" data-tour="editar-producto-form" onSubmit={handleSave} className="w-full space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-fg-muted">Nombre *</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg" required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">Precio venta *</label>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono text-fg" required />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">Costo unitario</label>
              <input type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono text-fg" />
            </div>
            <BarcodeField
              barcode={form.barcode}
              onBarcode={(barcode) => setForm((f) => ({ ...f, barcode }))}
              labelItem={{
                id,
                name: form.name || product.name,
                barcode: form.barcode,
                sku: product.supplierSku || '',
                category: categories.find((c) => c.id === form.categoryId)?.name || product.category?.name || '',
                price: parseFloat(form.price) || Number(product.price) || 0,
              }}
            />
            <div>
              <label className="mb-1 block text-sm text-fg-muted">Categoría</label>
              <CategorySelector value={form.categoryId} onChange={(cid) => setForm((f) => ({ ...f, categoryId: cid }))} categories={categories} onCategoriesChange={setCategories} placeholder="Sin categoría" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">Marca</label>
              <input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">Stock mínimo</label>
              <input type="number" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono text-fg" />
            </div>
            <label className="flex items-center gap-2 self-end rounded-lg border border-hair bg-raised px-3 py-2.5 text-sm text-fg-muted">
              <input type="checkbox" checked={form.stockControl} onChange={(e) => setForm((f) => ({ ...f, stockControl: e.target.checked }))} />
              Controlar stock
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm text-fg-muted">Imagen</label>
            <ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} maxPx={1200} previewClass="w-16 h-16 object-contain" label="Subir imagen" />
            <div className="mt-3">
              <SerperImagePicker query={[form.name, form.brand].filter(Boolean).join(' ')} value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
            </div>
          </div>

          {product?.unitsPerBoxNum != null && product.unitsPerBoxNum >= 2 && (
            <div className="rounded-lg border border-hair bg-raised px-4 py-3 text-sm text-fg-muted">
              Bulto × {product.unitsPerBoxNum}
              {product.costBox != null && <> · costo bulto <strong className="text-fg">${Number(product.costBox).toFixed(0)}</strong></>}
              {product.priceBox != null && <> · precio bulto <strong className="text-fg">${Number(product.priceBox).toFixed(0)}</strong></>}
            </div>
          )}

          {(() => {
            const groups: { key: string; title: string; fields: { key: keyof typeof form; label: string; type?: string }[] }[] = [
              { key: 'logistica', title: 'Logística y presentación', fields: [
                { key: 'unitsPerBox', label: 'Unidades por bulto' },
                { key: 'weight', label: 'Peso' },
                { key: 'format', label: 'Formato' },
                { key: 'flavor', label: 'Sabor' },
                { key: 'presentation', label: 'Presentación' },
                { key: 'subcategory', label: 'Subcategoría' },
              ]},
              { key: 'otros', title: 'Otros', fields: [
                { key: 'expiresAt', label: 'Vencimiento (referencia)', type: 'date' },
              ]},
            ];
            const emptyGroups = groups.map((g) => ({
              ...g,
              fields: g.fields.filter((f) => !String(form[f.key] ?? '').trim()),
            })).filter((g) => g.fields.length);
            const filledExtras = groups.flatMap((g) => g.fields.filter((f) => String(form[f.key] ?? '').trim()));
            return (
              <>
                {filledExtras.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filledExtras.map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-sm text-fg-muted">{f.label}</label>
                        <input type={f.type || 'text'} value={String(form[f.key] ?? '')} onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: e.target.value }))} className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg" />
                      </div>
                    ))}
                  </div>
                )}
                {emptyGroups.length > 0 && (
                  <div className="space-y-2 border-t border-hair-soft pt-3">
                    <p className="text-sm font-medium text-fg-muted">Campos vacíos ({emptyGroups.reduce((n, g) => n + g.fields.length, 0)})</p>
                    {emptyGroups.map((g) => (
                      <details key={g.key} className="rounded-lg border border-hair-soft bg-raised" open={Boolean(extraOpen[g.key])} onToggle={(e) => setExtraOpen((cur) => ({ ...cur, [g.key]: (e.target as HTMLDetailsElement).open }))}>
                        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden flex items-center justify-between">
                          <span>{g.title}</span>
                          <span className="font-mono text-xs text-fg-faint">{g.fields.length}</span>
                        </summary>
                        <div className="grid gap-3 border-t border-hair-soft p-3 sm:grid-cols-2">
                          {g.fields.map((f) => (
                            <div key={f.key}>
                              <label className="mb-1 block text-xs text-fg-muted">{f.label}</label>
                              <input type={f.type || 'text'} value={String(form[f.key] ?? '')} onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: e.target.value }))} className="w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg" />
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </form>


        <div className="space-y-6 w-full">
          {(nextExpiry || product.expiresAt) && (
            <div className={`rounded-lg border p-4 w-full ${nextExpiry && new Date(nextExpiry.date) < new Date() ? 'border-crit/30 bg-[var(--crit-soft)]' : 'border-warn/30 bg-[var(--warn-soft)]'}`}>
              <h3 className="font-medium text-warn mb-1">Vencimiento</h3>
              <p className="text-fg">
                {nextExpiry ? (
                  <>
                    {new Date(nextExpiry.date).toLocaleDateString('es-AR')}
                    <span className="text-fg-muted ml-2">· {nextExpiry.qty} unidad{nextExpiry.qty !== 1 ? 'es' : ''} vencen en esa fecha</span>
                    {new Date(nextExpiry.date) < new Date() ? (
                      <span className="text-crit ml-2">· Vencido</span>
                    ) : (
                      <span className="text-warn ml-2">
                        · Vence en {Math.ceil((new Date(nextExpiry.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} días
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {product.expiresAt && new Date(product.expiresAt).toLocaleDateString('es-AR')}
                    {new Date(product.expiresAt!) < new Date() ? (
                      <span className="text-crit ml-2">· Vencido</span>
                    ) : (
                      <span className="text-warn ml-2">
                        · Vence en {Math.ceil((new Date(product.expiresAt!).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} días
                      </span>
                    )}
                    <span className="text-fg-faint ml-2 text-sm">(referencia; ver lotes abajo)</span>
                  </>
                )}
              </p>
            </div>
          )}
          <div data-tour="editar-producto-stock" className="w-full rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
            <h3 className="font-medium text-fg mb-1">Stock actual</h3>
            <p className="text-2xl font-bold text-fg mb-1">{product.stock} unidades</p>
            {nextExpiry && (
              <p className="text-sm text-fg-muted mb-3">
                Próximo vencimiento: {new Date(nextExpiry.date).toLocaleDateString('es-AR')} ({nextExpiry.qty} un.)
              </p>
            )}
            <h4 className="text-sm font-medium text-fg-muted mb-2">Lotes</h4>
            <p className="text-xs text-fg-faint mb-3">
              Mismo producto puede tener distintos vencimientos o costos por compra. Acá se ve cada lote (cantidad, costo, vencimiento). Se descuentan por orden de vencimiento al vender.
            </p>
            <div className="overflow-x-auto rounded border border-hair-soft mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-faint bg-raised border-b border-hair-soft">
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Costo unit.</th>
                    <th className="px-3 py-2">Vencimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {(product.batches?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-fg-faint text-center text-sm">
                        Sin lotes. Los lotes se crean al cargar compras (desde Compras) o al hacer un ajuste positivo de stock.
                      </td>
                    </tr>
                  ) : (
                    (product.batches ?? []).map((b) => (
                      <tr key={b.id} className="border-b border-hair-soft/50">
                        <td className="px-3 py-2 text-fg">{b.qty}</td>
                        <td className="px-3 py-2 text-fg-muted">${Number(b.unitCost).toFixed(0)}</td>
                        <td className="px-3 py-2 text-fg-muted">
                          {b.expiresAt
                            ? new Date(b.expiresAt).toLocaleDateString('es-AR')
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <form data-tour="editar-producto-ajuste" onSubmit={handleAdjust} className="space-y-2">
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-fg-faint mb-0.5">Cantidad (+/-)</label>
                  <input
                    type="number"
                    placeholder="Ej: 10 o -5"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="w-24 px-2 py-1.5 rounded bg-raised border border-hair-soft text-fg"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-fg-faint mb-0.5">Motivo</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-raised border border-hair-soft text-fg"
                  >
                    <option value="">Elegir motivo...</option>
                    {STOCK_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="px-3 py-1.5 rounded btn-brand text-sm">Ajustar</button>
              </div>
            </form>
          </div>
          <div data-tour="editar-producto-movimientos" className="w-full overflow-hidden rounded-xl border border-hair-soft bg-surface">
            <h3 className="px-4 py-2 bg-raised text-fg font-medium">Historial de movimientos</h3>
            <p className="px-4 py-1 text-fg-faint text-xs">Entradas y salidas de stock con fecha y motivo</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-faint border-b border-hair-soft">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Cantidad</th>
                    <th className="px-4 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-fg-faint text-center">Sin movimientos</td></tr>
                  ) : (
                    (Array.isArray(moves) ? moves : []).map((m) => (
                      <tr key={m.id} className="border-b border-hair-soft/50 hover:bg-raised">
                        <td className="px-4 py-2 text-fg-muted">{new Date(m.createdAt).toLocaleString('es-AR')}</td>
                        <td className={`px-4 py-2 font-medium ${m.qty >= 0 ? 'text-ok' : 'text-crit'}`}>
                          {m.qty >= 0 ? '+' : ''}{m.qty}
                        </td>
                        <td className="px-4 py-2 text-fg-muted">{STOCK_REASONS.find((r) => r.value === m.reason)?.label ?? m.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>


      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">{saveMsg || 'Los cambios se guardan en la ficha local.'}</p>
          <button type="submit" form="editar-producto-form" disabled={saving} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

    </Container>
  );
}
