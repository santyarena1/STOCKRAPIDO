'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Send, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Loader } from '@/components/ui/Loader';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import type { DeliveryProvider } from '@/lib/delivery';
import { calculateDeliveryListPrice } from '@/lib/delivery-listing';

type CategoryRule = {
  categoryId: string;
  categoryName: string;
  productCount: number;
  published: boolean;
  platformCategoryId: string | null;
  platformCategoryName: string | null;
};

type Listing = {
  id: string;
  name: string;
  externalSku: string | null;
  category: string | null;
  basePrice: number | null;
  listPrice: number | null;
  published: boolean;
  available: boolean;
  syncStatus: string;
  platformCategoryName: string | null;
  shortDescription: string | null;
  validation: { ready: boolean; issues: { label: string; level: string }[] };
  product?: { id: string; name: string } | null;
};

export function DeliveryPublishPanel({
  provider,
  markupPercent,
  commissionPercent,
}: {
  provider: DeliveryProvider;
  markupPercent: number;
  commissionPercent: number;
}) {
  const meta = DELIVERY_PROVIDER_META[provider];
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [editing, setEditing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleList, listingList] = await Promise.all([
        api<CategoryRule[]>(`/delivery/integrations/${provider}/category-rules`),
        api<Listing[]>(`/delivery/integrations/${provider}/listings`),
      ]);
      setRules(ruleList);
      setListings(listingList);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRules = async () => {
    setBusy('rules');
    try {
      await api(`/delivery/integrations/${provider}/category-rules`, {
        method: 'PATCH',
        body: JSON.stringify({
          rules: rules.map((r) => ({
            categoryId: r.categoryId,
            published: r.published,
            platformCategoryId: r.platformCategoryId,
            platformCategoryName: r.platformCategoryName,
          })),
        }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loader label="Publicar" />;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-hair-soft bg-surface p-4">
        <h2 className="font-semibold text-fg">Categorías a publicar en {meta.label}</h2>
        <p className="mt-1 text-sm text-fg-faint">Elegí qué categorías entran al catálogo de la app y mapeá su categoría en {meta.label}.</p>
        <div className="mt-4 space-y-2">
          {rules.map((rule, idx) => (
            <div key={rule.categoryId} className="grid gap-2 rounded-xl border border-hair bg-raised p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={rule.published}
                  onChange={(e) => setRules((rows) => rows.map((r, i) => (i === idx ? { ...r, published: e.target.checked } : r)))}
                />
                {rule.categoryName} <span className="text-fg-faint">({rule.productCount})</span>
              </label>
              <input
                value={rule.platformCategoryName ?? ''}
                onChange={(e) => setRules((rows) => rows.map((r, i) => (i === idx ? { ...r, platformCategoryName: e.target.value } : r)))}
                placeholder={`Categoría en ${meta.label}`}
                className="rounded-lg border border-hair bg-surface px-3 py-2 text-sm"
              />
              <input
                value={rule.platformCategoryId ?? ''}
                onChange={(e) => setRules((rows) => rows.map((r, i) => (i === idx ? { ...r, platformCategoryId: e.target.value } : r)))}
                placeholder="ID categoría plataforma"
                className="rounded-lg border border-hair bg-surface px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <button type="button" disabled={busy === 'rules'} onClick={() => void saveRules()} className="mt-3 rounded-xl border border-hair px-4 py-2 text-sm font-semibold">
          Guardar categorías e importar productos
        </button>
      </section>

      <section className="rounded-2xl border border-hair-soft bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-fg">Productos publicados</h2>
            <p className="text-sm text-fg-faint">Margen {markupPercent}% · Comisión {commissionPercent}%</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => void run('import', () => api(`/delivery/integrations/${provider}/listings/import`, { method: 'POST', body: JSON.stringify({ allActive: true }) }))} className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-2 text-sm">
              <Upload className="h-4 w-4" /> Importar activos
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('validate', () => api(`/delivery/integrations/${provider}/listings/validate`, { method: 'POST' }))} className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4" /> Validar
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('push', () => api(`/delivery/integrations/${provider}/listings/push`, { method: 'POST' }))} className="btn-brand inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold">
              <Send className="h-4 w-4" /> Enviar a {meta.label}
            </button>
            <button type="button" onClick={() => void load()} className="rounded-lg border border-hair p-2"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>

        {!listings.length ? (
          <p className="py-10 text-center text-sm text-fg-faint">Sin productos. Guardá categorías o importá activos.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase text-fg-faint">
                <tr>
                  <th className="p-2">Pub.</th>
                  <th className="p-2">Producto</th>
                  <th className="p-2">Categoría app</th>
                  <th className="p-2">Precio POS</th>
                  <th className="p-2">Precio {meta.label}</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-soft">
                {listings.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={item.published}
                        onChange={(e) =>
                          void api(`/delivery/integrations/${provider}/listings/${item.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ published: e.target.checked }),
                          }).then(load)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <p className="font-medium">{item.name}</p>
                      <p className="font-mono text-xs text-fg-faint">{item.externalSku}</p>
                    </td>
                    <td className="p-2 text-fg-muted">{item.platformCategoryName || '—'}</td>
                    <td className="p-2 font-mono">${(item.basePrice ?? 0).toLocaleString('es-AR')}</td>
                    <td className="p-2 font-mono font-semibold">${(item.listPrice ?? calculateDeliveryListPrice(item.basePrice ?? 0, markupPercent, commissionPercent)).toLocaleString('es-AR')}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.validation.ready ? 'bg-[var(--ok-soft)] text-ok' : 'bg-[var(--warn-soft)] text-warn'}`}>
                        {item.syncStatus}
                      </span>
                    </td>
                    <td className="p-2">
                      <button type="button" onClick={() => setEditing(item)} className="text-brand text-xs font-semibold">Editar ficha</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hair bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Ficha en {meta.label}</h3>
            <p className="text-sm text-fg-muted">{editing.name}</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void api(`/delivery/integrations/${provider}/listings/${editing.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    name: fd.get('name'),
                    shortDescription: fd.get('shortDescription'),
                    description: fd.get('description'),
                    platformCategoryName: fd.get('platformCategoryName'),
                    platformCategoryId: fd.get('platformCategoryId'),
                    imageUrl: fd.get('imageUrl'),
                    priceMode: fd.get('priceMode'),
                    listPrice: fd.get('priceMode') === 'manual' ? Number(fd.get('listPrice')) : undefined,
                  }),
                }).then(() => {
                  setEditing(null);
                  return load();
                });
              }}
            >
              <label className="block text-sm">Nombre<input name="name" defaultValue={editing.name} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">Descripción corta<textarea name="shortDescription" defaultValue={editing.shortDescription ?? ''} rows={2} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">Descripción larga<textarea name="description" defaultValue="" rows={2} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">Categoría {meta.label}<input name="platformCategoryName" defaultValue={editing.platformCategoryName ?? ''} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">ID categoría<input name="platformCategoryId" defaultValue="" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">Imagen URL<input name="imageUrl" defaultValue="" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              <label className="block text-sm">Precio<select name="priceMode" defaultValue="calculated" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2"><option value="calculated">Calculado (margen + comisión)</option><option value="manual">Manual</option></select></label>
              <label className="block text-sm">Precio manual<input name="listPrice" type="number" defaultValue={editing.listPrice ?? ''} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" /></label>
              {!editing.validation.ready ? (
                <ul className="rounded-lg bg-[var(--warn-soft)] p-3 text-xs text-warn">
                  {editing.validation.issues.map((i) => (
                    <li key={i.label}>{i.level === 'required' ? 'Obligatorio' : 'Recomendado'}: {i.label}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <button type="submit" className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">Guardar</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-hair px-4 py-2 text-sm">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
