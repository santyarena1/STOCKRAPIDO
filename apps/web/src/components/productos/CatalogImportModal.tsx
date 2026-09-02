'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';
import { Loader } from '@/components/ui/Loader';

type Category = { id: string; name: string };

type SimilarProduct = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  price: unknown;
  cost: unknown;
  category?: { name: string } | null;
};

type Preview = {
  publicProduct: {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    barcode: string | null;
    imageUrl: string | null;
  };
  alreadyImported: boolean;
  localProductId: string | null;
  suggestedCategoryId: string | null;
  similarProducts: SimilarProduct[];
};

type Props = {
  publicProductId: string | null;
  onClose: () => void;
  onImported: () => void;
};

export function CatalogImportModal({ publicProductId, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    barcode: '',
    brand: '',
    categoryId: '',
    price: '',
    cost: '',
  });

  useEffect(() => {
    if (!publicProductId) return;
    setLoading(true);
    Promise.all([
      api<Preview>(`/public-catalog/import-preview/${publicProductId}`),
      api<Category[]>('/business/categories'),
    ])
      .then(([p, cats]) => {
        setPreview(p);
        setCategories(Array.isArray(cats) ? cats : []);
        setForm({
          barcode: p.publicProduct.barcode || '',
          brand: p.publicProduct.brand || '',
          categoryId: p.suggestedCategoryId || '',
          price: '',
          cost: '',
        });
      })
      .catch((e) => {
        alert(e instanceof Error ? e.message : 'No se pudo cargar la ficha');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [publicProductId, onClose]);

  const handleImport = async () => {
    if (!publicProductId || !preview) return;
    if (preview.alreadyImported && preview.localProductId) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { publicProductId };
      if (form.barcode.trim()) body.barcode = form.barcode.trim();
      if (form.brand.trim()) body.brand = form.brand.trim();
      if (form.categoryId) body.categoryId = form.categoryId;
      const price = parseFloat(form.price.replace(',', '.'));
      const cost = parseFloat(form.cost.replace(',', '.'));
      if (Number.isFinite(price) && price >= 0) body.price = price;
      if (Number.isFinite(cost) && cost >= 0) body.cost = cost;

      const result = await api<{
        created: boolean;
        message?: string;
        product: { id: string };
      }>('/public-catalog/import', { method: 'POST', body: JSON.stringify(body) });

      if (!result.created && result.message) {
        alert(result.message);
      }
      onImported();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo importar');
    } finally {
      setSaving(false);
    }
  };

  if (!publicProductId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hair-soft px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Importar al inventario</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised">
            ✕
          </button>
        </div>

        {loading || !preview ? (
          <div className="p-8">
            <Loader size="sm" label="Ficha del catálogo" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex gap-3">
                {preview.publicProduct.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.publicProduct.imageUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg object-contain bg-raised border border-hair-soft"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-raised border border-hair-soft" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-fg">{preview.publicProduct.name}</p>
                  <p className="text-xs text-fg-faint mt-0.5">
                    {[preview.publicProduct.brand, preview.publicProduct.category]
                      .filter(Boolean)
                      .join(' · ') || 'Sin marca ni categoría en la ficha'}
                  </p>
                </div>
              </div>

              {preview.alreadyImported && preview.localProductId ? (
                <div className="rounded-lg border border-ok/30 bg-[var(--ok-soft)] px-3 py-2 text-sm text-ok">
                  Ya importaste esta ficha.{' '}
                  <Link href={`/productos/${preview.localProductId}`} className="font-medium underline">
                    Ver en tu inventario
                  </Link>
                </div>
              ) : null}

              {preview.similarProducts.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] px-3 py-3 text-sm">
                  <p className="font-medium text-warn">Productos parecidos en tu inventario</p>
                  <p className="text-xs text-fg-muted mt-1 mb-2">
                    Revisá si ya tenés algo igual antes de importar.
                  </p>
                  <ul className="space-y-1.5">
                    {preview.similarProducts.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-fg">
                          {p.name}
                          {p.brand ? ` · ${p.brand}` : ''}
                          {p.barcode ? ` · ${p.barcode}` : ''}
                        </span>
                        <Link href={`/productos/${p.id}`} className="text-brand hover:underline shrink-0">
                          Ver
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!preview.alreadyImported && (
                <div className="space-y-3 border-t border-hair-soft pt-4">
                  <p className="text-sm text-fg-muted">
                    Completá lo que quieras (todo opcional). Podés dejarlo en cero y editarlo después.
                  </p>
                  <label className="block text-sm">
                    <span className="text-fg-muted">Código de barras</span>
                    <input
                      value={form.barcode}
                      onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-fg-muted">Marca</span>
                    <input
                      value={form.brand}
                      onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
                      placeholder="Opcional"
                    />
                  </label>
                  <div className="text-sm">
                    <span className="text-fg-muted">Categoría</span>
                    <div className="mt-1">
                      <CategorySelector
                        value={form.categoryId}
                        onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
                        categories={categories}
                        onCategoriesChange={setCategories}
                        placeholder="Opcional"
                        className="!bg-raised !border-hair !text-fg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="text-fg-muted">Precio de venta</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg font-mono"
                        placeholder="0"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-fg-muted">Costo</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.cost}
                        onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg font-mono"
                        placeholder="0"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-hair-soft px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:bg-raised"
              >
                Cancelar
              </button>
              {preview.alreadyImported && preview.localProductId ? (
                <Link
                  href={`/productos/${preview.localProductId}`}
                  className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  Ir al producto
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleImport()}
                  className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Importando…' : 'Importar'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
