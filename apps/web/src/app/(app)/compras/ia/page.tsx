'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, apiUpload } from '@/lib/api';
import { SupplierSelector } from '@/components/SupplierSelector';
import { CategorySelector } from '@/components/CategorySelector';

type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  stock: number;
  minStock: number;
  price: string | number;
  cost?: string | number;
  category?: { id: string; name: string };
};
type Supplier = { id: string; name: string };
type Category = { id: string; name: string };

type PurchaseItemRow = {
  productId: string;
  productName: string;
  barcode: string;
  categoryId: string;
  qty: string;
  unitCost: string;
  price: string;
  minStock: string;
  expiresAt: string;
};

type JobStatusResponse =
  | { status: 'pending'; filename: string }
  | { status: 'failed'; filename: string; error: string }
  | {
      status: 'completed';
      filename: string;
      result: {
        supplierId: string;
        items: {
          productId?: string;
          productName?: string;
          barcode?: string;
          categoryId?: string;
          qty: number;
          unitCost: number;
          price?: number;
          minStock?: number;
          expiresAt?: string;
        }[];
      };
    };

const emptyItem = (): PurchaseItemRow => ({
  productId: '',
  productName: '',
  barcode: '',
  categoryId: '',
  qty: '1',
  unitCost: '0',
  price: '',
  minStock: '0',
  expiresAt: '',
});

function formatExpiry(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function ComprasIaPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  /** Error al enviar el archivo al servidor. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Error mientras se espera N8N o timeout. */
  const [pollError, setPollError] = useState<string | null>(null);
  /** Archivo elegido antes de que termine el envío (feedback inmediato). */
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null);
  /** Tras respuesta OK del servidor (antes del callback N8N). */
  const [uploadConfirmed, setUploadConfirmed] = useState<{ name: string; jobId: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    items: [emptyItem()] as PurchaseItemRow[],
  });
  const [searchTerm, setSearchTerm] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, Product[]>>({});
  const [highlightedResultIndex, setHighlightedResultIndex] = useState<Record<number, number>>({});
  const [aiFilled, setAiFilled] = useState(false);
  /** Solo probar envío a N8N (sin esperar callback ni pedir secreto). */
  const [sendOnlyMode, setSendOnlyMode] = useState(false);
  const [sendOnlyOk, setSendOnlyOk] = useState<{ message: string; n8nHttpStatus: number } | null>(null);

  useEffect(() => {
    Promise.allSettled([api<Supplier[]>('/suppliers'), api<Category[]>('/business/categories')]).then(
      ([sRes, cRes]) => {
        setSuppliers(sRes.status === 'fulfilled' && Array.isArray(sRes.value) ? sRes.value : []);
        setCategories(cRes.status === 'fulfilled' && Array.isArray(cRes.value) ? cRes.value : []);
      },
    ).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    Object.entries(searchTerm).forEach(([idxStr, term]) => {
      const idx = Number(idxStr);
      if (!term.trim()) {
        setSearchResults((r) => ({ ...r, [idx]: [] }));
        return;
      }
      const t = setTimeout(async () => {
        const data = await api<Product[]>('/products/search', { params: { q: term, limit: '10' } }).catch(() => []);
        setSearchResults((r) => ({ ...r, [idx]: Array.isArray(data) ? data : [] }));
      }, 300);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [searchTerm]);

  const pollJob = useCallback(
    async (id: string) => {
      const maxAttempts = 90;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const data = await api<JobStatusResponse>(`/purchases/ai-invoice/${id}`).catch((e) => {
          throw e instanceof Error ? e : new Error('Error al consultar el estado');
        });
        if (data.status === 'failed') {
          setPollError(data.error || 'Error al procesar la factura');
          setJobId(null);
          setUploadConfirmed(null);
          return;
        }
        if (data.status === 'completed' && data.result) {
          const { supplierId, items } = data.result;
          setForm({
            supplierId,
            items:
              items.length > 0
                ? items.map((it) => ({
                    productId: it.productId || '',
                    productName: it.productName || '',
                    barcode: it.barcode || '',
                    categoryId: it.categoryId || '',
                    qty: String(it.qty),
                    unitCost: String(it.unitCost),
                    price: it.price != null ? String(it.price) : '',
                    minStock: it.minStock != null ? String(it.minStock) : '0',
                    expiresAt: formatExpiry(it.expiresAt),
                  }))
                : [emptyItem()],
          });
          setSearchTerm({});
          setSearchResults({});
          setAiFilled(true);
          setJobId(null);
          setUploadConfirmed(null);
          setPickedFile(null);
          return;
        }
      }
      setPollError('Tiempo de espera agotado. Revisá N8N y que el callback llegue a la API.');
      setJobId(null);
      setUploadConfirmed(null);
    },
    [],
  );

  useEffect(() => {
    if (!jobId) return;
    setPollError(null);
    pollJob(jobId).catch((e) => {
      setPollError(e instanceof Error ? e.message : 'Error al consultar el estado');
      setJobId(null);
    });
  }, [jobId, pollJob]);

  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  };

  const removeItem = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  const setItem = (index: number, patch: Partial<PurchaseItemRow>) => {
    setForm((f) => {
      const n = [...f.items];
      n[index] = { ...n[index], ...patch };
      return { ...f, items: n };
    });
  };

  const selectProduct = (index: number, p: Product) => {
    setItem(index, {
      productId: p.id,
      productName: p.name,
      barcode: p.barcode || '',
      categoryId: p.category?.id ?? '',
      price: p.price != null ? String(p.price) : '',
    });
    setSearchTerm((t) => ({ ...t, [index]: '' }));
    setSearchResults((r) => ({ ...r, [index]: [] }));
    setHighlightedResultIndex((h) => ({ ...h, [index]: 0 }));
  };

  const handleProductInputKeyDown = (itemIndex: number, e: React.KeyboardEvent) => {
    const results = searchResults[itemIndex] ?? [];
    if (results.length === 0) return;
    const current = Math.min(highlightedResultIndex[itemIndex] ?? 0, results.length - 1);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: Math.min(current + 1, results.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: Math.max(current - 1, 0) }));
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      selectProduct(itemIndex, results[current]);
    } else if (e.key === 'Escape') {
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: 0 }));
    }
  };

  const formatSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setPickedFile({ name: file.name, size: file.size });
    setUploadError(null);
    setPollError(null);
    setAiFilled(false);
    setUploadConfirmed(null);
    setSendOnlyOk(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<
        { jobId: string } | { sendOnly: true; n8nHttpStatus: number; message: string }
      >(
        '/purchases/ai-invoice/upload',
        fd,
        sendOnlyMode ? { params: { sendOnly: 'true' } } : undefined,
      );
      if ('sendOnly' in res && res.sendOnly) {
        setSendOnlyOk({ message: res.message, n8nHttpStatus: res.n8nHttpStatus });
        return;
      }
      if ('jobId' in res) {
        setUploadConfirmed({ name: file.name, jobId: res.jobId });
        setJobId(res.jobId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al subir el archivo';
      setUploadError(msg);
      setPickedFile(null);
    } finally {
      setUploading(false);
      setPickedFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId) {
      alert('Elegí un proveedor.');
      return;
    }
    const items = form.items
      .map((i) => ({
        productId: i.productId || undefined,
        productName: i.productName.trim() || undefined,
        barcode: i.barcode.trim() || undefined,
        categoryId: i.categoryId || undefined,
        qty: parseInt(i.qty, 10) || 0,
        unitCost: parseFloat(i.unitCost) || 0,
        price: i.price !== '' && i.price != null ? parseFloat(String(i.price)) : undefined,
        minStock: i.minStock ? parseInt(i.minStock, 10) : undefined,
        expiresAt: i.expiresAt || undefined,
      }))
      .filter((i) => i.qty > 0 && (i.productId || i.productName));
    if (items.length === 0) {
      alert('Agregá al menos un ítem con cantidad y producto (nombre o selección).');
      return;
    }
    try {
      await api('/purchases', {
        method: 'POST',
        body: JSON.stringify({ supplierId: form.supplierId, items }),
      });
      setForm({ supplierId: '', items: [emptyItem()] });
      setAiFilled(false);
      alert('Compra registrada correctamente.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Link href="/compras" className="text-slate-400 hover:text-white text-sm">
          ← Compras
        </Link>
        <h1 className="text-2xl font-bold text-white">Compras con IA</h1>
      </div>

      <p className="text-slate-400 text-sm mb-6 max-w-3xl">
        Subí una factura de compra (PDF o imagen). La API la envía a tu flujo en N8N; cuando N8N devuelve los
        datos al webhook de callback, se completan los campos igual que en una carga manual. Revisá y
        confirmá antes de guardar.
      </p>

      <label className="flex items-start gap-3 mb-6 cursor-pointer max-w-3xl">
        <input
          type="checkbox"
          checked={sendOnlyMode}
          onChange={(e) => {
            setSendOnlyMode(e.target.checked);
            setSendOnlyOk(null);
          }}
          disabled={uploading || !!jobId}
          className="mt-1 rounded border-slate-600"
        />
        <span className="text-sm text-slate-300">
          <strong className="text-violet-300">Solo enviar a N8N (probar conexión)</strong> — envía la misma
          información (incluido <code className="text-slate-400">fileBase64</code>) al webhook. No pide el
          secreto del callback ni espera respuesta: sirve para comprobar que N8N recibe la factura mientras la API
          sigue en localhost.
        </span>
      </label>

      <div className="rounded-lg border border-violet-700/40 bg-violet-950/20 p-6 mb-8">
        <h2 className="text-lg font-medium text-violet-200 mb-3">1. Factura</h2>
        <label
          htmlFor="compras-ia-file"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            if (uploading || (jobId && !sendOnlyMode)) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
            dragOver
              ? 'border-violet-400 bg-violet-900/30'
              : 'border-slate-600 hover:border-violet-500/60'
          } ${uploading || (jobId && !sendOnlyMode) ? 'opacity-80 cursor-not-allowed' : ''}`}
        >
          <input
            id="compras-ia-file"
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={uploading || (!!jobId && !sendOnlyMode)}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              handleFile(f);
              e.target.value = '';
            }}
          />
          <span className="text-slate-200 text-center font-medium">
            {pickedFile && uploading
              ? `Enviando: ${pickedFile.name}`
              : uploading
                ? 'Enviando archivo…'
                : jobId && !sendOnlyMode
                  ? 'Esperando respuesta de N8N…'
                  : 'Elegí un archivo o soltalo acá'}
          </span>
          <span className="text-slate-400 text-sm text-center mt-2 max-w-md">
            {pickedFile && uploading
              ? `${formatSize(pickedFile.size)}`
              : jobId && uploadConfirmed && !sendOnlyMode
                ? `Factura: ${uploadConfirmed.name} · trabajo ${uploadConfirmed.jobId.slice(0, 8)}…`
                : 'PDF, JPG, PNG, WebP (máx. 15 MB)'}
          </span>
          <span className="text-xs text-slate-500 mt-2">Tocá para abrir el selector de archivos</span>
        </label>

        {sendOnlyOk && (
          <div className="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">
            <p className="font-medium text-emerald-300">Prueba de envío OK (HTTP {sendOnlyOk.n8nHttpStatus})</p>
            <p className="mt-1 text-emerald-100/90">{sendOnlyOk.message}</p>
            <p className="mt-2 text-xs text-emerald-400/80">
              Revisá la ejecución en N8N. Cuando tengas callback público, desactivá esta opción para completar la
              compra automáticamente.
            </p>
          </div>
        )}

        {(pickedFile || uploadConfirmed || uploadError || pollError) && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-600 bg-slate-900/50 p-4 text-sm" aria-live="polite">
            <p className="text-slate-500 text-xs uppercase tracking-wide">Estado del archivo</p>
            {pickedFile && uploading && (
              <p className="text-amber-300 text-sm">
                Subiendo <strong className="text-white">{pickedFile.name}</strong> ({formatSize(pickedFile.size)})…
              </p>
            )}
            {!uploading && uploadConfirmed && jobId && !sendOnlyMode && (
              <p className="text-emerald-400 text-sm">
                <strong className="text-emerald-300">✓ Archivo recibido por el servidor.</strong> {uploadConfirmed.name} — esperando
                que N8N devuelva los datos (trabajo{' '}
                <code className="text-slate-300 bg-slate-800 px-1 rounded">{uploadConfirmed.jobId}</code>).
              </p>
            )}
            {!uploading && uploadError && (
              <p className="text-red-400 text-sm" role="alert">
                No se pudo enviar el archivo: {uploadError}
              </p>
            )}
            {!uploading && !jobId && pollError && (
              <p className="text-red-400 text-sm" role="alert">
                {pollError}
              </p>
            )}
          </div>
        )}
        {aiFilled && (
          <p className="mt-4 text-emerald-400 text-sm">
            Datos recibidos desde N8N. Revisá la compra abajo y confirmá.
          </p>
        )}
      </div>

      <form data-tour="compras-ia-form" onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-8">
        <h2 className="text-lg font-medium text-slate-200">2. Revisar y confirmar compra</h2>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Proveedor *</label>
          <SupplierSelector
            value={form.supplierId}
            onChange={(id) => setForm((f) => ({ ...f, supplierId: id }))}
            suppliers={suppliers}
            onSuppliersChange={setSuppliers}
            placeholder="Seleccionar o crear proveedor"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-slate-400">Ítems de la compra</label>
            <button type="button" onClick={addItem} className="text-sky-400 text-sm hover:underline">
              + Agregar ítem
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Misma lógica que en Compras manual: buscá producto o cargá nombre/código para crear uno nuevo.
          </p>

          <div className="overflow-x-auto space-y-4">
            {form.items.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-600 bg-slate-800/30 p-4 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Ítem {i + 1}</span>
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-red-400 text-sm hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs text-slate-500 mb-0.5">Producto (buscar o escribir nombre) *</label>
                    <input
                      type="text"
                      value={item.productId ? item.productName : searchTerm[i] ?? item.productName}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (item.productId) setItem(i, { productId: '', productName: v, barcode: '' });
                        else setItem(i, { productName: v });
                        setSearchTerm((t) => ({ ...t, [i]: v }));
                        setHighlightedResultIndex((h) => ({ ...h, [i]: 0 }));
                      }}
                      onFocus={() => {
                        if (!item.productId) setSearchTerm((t) => ({ ...t, [i]: item.productName || '' }));
                        setHighlightedResultIndex((h) => ({ ...h, [i]: 0 }));
                      }}
                      onKeyDown={(e) => handleProductInputKeyDown(i, e)}
                      placeholder="Nombre o buscar..."
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                    />
                    {!item.productId && (searchResults[i]?.length ?? 0) > 0 && (
                      <ul className="mt-1 border border-slate-600 rounded bg-slate-800 max-h-32 overflow-auto" role="listbox">
                        {searchResults[i].map((p, idx) => {
                          const highlighted = Math.min(highlightedResultIndex[i] ?? 0, searchResults[i].length - 1);
                          return (
                            <li
                              key={p.id}
                              role="option"
                              aria-selected={idx === highlighted}
                              className={`px-2 py-1.5 text-sm text-slate-200 cursor-pointer flex justify-between ${idx === highlighted ? 'bg-sky-600/30 ring-1 ring-sky-500/50' : 'hover:bg-slate-700'}`}
                              onClick={() => selectProduct(i, p)}
                            >
                              <span>{p.name}</span>
                              {p.barcode && <span className="text-slate-500 text-xs">{p.barcode}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Código de barras</label>
                    <input
                      type="text"
                      value={item.barcode}
                      onChange={(e) => setItem(i, { barcode: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Categoría (producto nuevo)</label>
                    <CategorySelector
                      value={item.categoryId}
                      onChange={(id) => setItem(i, { categoryId: id })}
                      categories={categories}
                      onCategoriesChange={(arg) => setCategories((prev) => (typeof arg === 'function' ? arg(prev) : arg))}
                      placeholder="—"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Cantidad *</label>
                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => setItem(i, { qty: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Costo unitario *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitCost}
                      onChange={(e) => setItem(i, { unitCost: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Precio venta</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.price}
                      onChange={(e) => setItem(i, { price: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Vencimiento (lote)</label>
                    <input
                      type="date"
                      value={item.expiresAt}
                      onChange={(e) => setItem(i, { expiresAt: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={form.items.length === 0 || !form.supplierId}
          className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50"
        >
          Confirmar compra
        </button>
      </form>
    </div>
  );
}
