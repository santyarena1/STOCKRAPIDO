'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';
import { ImageUploader } from '@/components/ImageUploader';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';

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
};
type Category = { id: string; name: string };
type StockMove = { id: string; qty: number; reason: string; reference?: string; createdAt: string };

export default function EditarProductoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', barcode: '', categoryId: '', cost: '', price: '', minStock: '', brand: '', stockControl: true, expiresAt: '', imageUrl: '', unitsPerBox: '', weight: '', format: '', flavor: '', presentation: '', subcategory: '' });
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    Promise.allSettled([
      api<Product | null>(`/products/${id}`),
      api<Category[]>('/business/categories'),
      api<StockMove[]>(`/products/${id}/stock-moves`),
    ]).then(([pRes, catsRes, mRes]) => {
      const p = pRes.status === 'fulfilled' ? pRes.value : null;
      const cats = catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : [];
      const m = mRes.status === 'fulfilled' && Array.isArray(mRes.value) ? mRes.value : [];
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
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/products/${id}`, {
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
          expiresAt: form.expiresAt || undefined,
          imageUrl: form.imageUrl || undefined,
          unitsPerBox: form.unitsPerBox || undefined,
          weight: form.weight || undefined,
          format: form.format || undefined,
          flavor: form.flavor || undefined,
          presentation: form.presentation || undefined,
          subcategory: form.subcategory || undefined,
        }),
      });
      router.push('/productos');
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

  if (loading) return <div className="p-6 text-fg-muted">Cargando...</div>;
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

  return (
    <Container className="max-w-4xl space-y-6">
      <PageHeader title={product.name} actions={<Link href="/productos" className="text-fg-muted hover:text-fg">← Productos</Link>} />

      <div className="flex flex-col gap-6">
        <form data-tour="editar-producto-form" onSubmit={handleSave} className="w-full space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <div>
            <label className="block text-sm text-fg-muted mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-fg-muted mb-1">Código de barras</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-muted mb-1">Categoría</label>
              <CategorySelector
                value={form.categoryId}
                onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
                categories={categories}
                onCategoriesChange={setCategories}
                placeholder="Sin categoría"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-fg-muted mb-1">Costo unitario</label>
              <input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
              />
              <p className="text-xs text-fg-faint mt-0.5">Siempre por unidad · se actualiza con la última compra</p>
            </div>
            <div>
              <label className="block text-sm text-fg-muted mb-1">Precio venta unitario *</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
                required
              />
              <p className="text-xs text-fg-faint mt-0.5">Precio por unidad · se actualiza con la última compra</p>
            </div>
          </div>
          {product?.unitsPerBoxNum != null && product.unitsPerBoxNum >= 2 && (
            <div className="rounded-lg border border-hair bg-raised px-4 py-3 text-sm">
              <p className="text-fg font-medium mb-1">Producto por bulto · {product.unitsPerBoxNum} unidades</p>
              <div className="flex gap-6 text-fg-muted">
                {product.costBox != null && <span>Costo bulto: <strong>${Number(product.costBox).toFixed(0)}</strong></span>}
                {product.priceBox != null && <span>Precio bulto: <strong>${Number(product.priceBox).toFixed(0)}</strong></span>}
              </div>
              <p className="text-fg-faint text-xs mt-1">Referencia interna — los precios unitarios arriba son los que usa el sistema</p>
            </div>
          )}
          <div>
            <label className="block text-sm text-fg-muted mb-1">Stock mínimo</label>
            <input
              type="number"
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            />
          </div>
          <div>
            <label className="block text-sm text-fg-muted mb-1">Vencimiento (referencia)</label>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            />
            <p className="text-xs text-fg-faint mt-0.5">El vencimiento por lote se define en cada compra (ver Lotes abajo)</p>
          </div>
          <div>
            <label className="block text-sm text-fg-muted mb-1">Marca</label>
            <input
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            />
          </div>

          <div className="border-t border-hair00 pt-3">
            <p className="text-sm font-medium text-fg-muted mb-1">Datos internos / catálogo</p>
            <p className="text-xs text-fg-faint mb-3">Campos del proveedor. Unidades por bulto define si el producto se vende por bulto (referencia interna).</p>
            <div className="mb-3">
              <label className="block text-sm text-fg-muted mb-2">Imagen del producto</label>
              <ImageUploader
                value={form.imageUrl}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                maxPx={1200}
                previewClass="w-16 h-16 object-contain"
                label="Subir imagen"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['unitsPerBox', 'Unidades por bulto'],
                ['weight', 'Peso'],
                ['format', 'Formato'],
                ['flavor', 'Sabor'],
                ['presentation', 'Presentación'],
                ['subcategory', 'Subcategoría'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm text-fg-muted mb-1">{label}</label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-fg-muted cursor-pointer">
            <input type="checkbox" checked={form.stockControl} onChange={(e) => setForm((f) => ({ ...f, stockControl: e.target.checked }))} />
            Controlar stock
          </label>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg btn-brand disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
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
            <div className="overflow-x-auto rounded border border-hair00 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-faint bg-raised border-b border-hair00">
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
                      <tr key={b.id} className="border-b border-hair00/50">
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
                    className="w-24 px-2 py-1.5 rounded bg-raised border border-hair00 text-fg"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-fg-faint mb-0.5">Motivo</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-raised border border-hair00 text-fg"
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
                  <tr className="text-left text-fg-faint border-b border-hair00">
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
                      <tr key={m.id} className="border-b border-hair00/50 hover:bg-raised">
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
    </Container>
  );
}
