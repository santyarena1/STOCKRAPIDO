'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { assignProductImage, autoAssignSerperPhotos, isApiRouteMissing } from '@/lib/serper-client';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { SerperImagePicker } from '@/components/SerperImagePicker';

type Row = { id: string; name: string; brand?: string | null; barcode?: string | null; imageUrl?: string | null };

export default function ProductImagesEditorPage() {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [missingOnly, setMissingOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pageSize = 18;

  useEffect(() => {
    const timer = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const data = await api<{ total: number; items: Row[] }>('/products/serper/editor', {
          params: {
            q: qDebounced || undefined,
            missingOnly: missingOnly ? 'true' : 'false',
            page: String(page),
            pageSize: String(pageSize),
          },
        });
        setTotal(data.total);
        setItems(data.items || []);
      } catch (err) {
        if (!isApiRouteMissing(err)) throw err;
        const data = await api<{ total: number; items: Row[] }>('/products/catalog', {
          params: {
            q: qDebounced || undefined,
            page: String(page),
            pageSize: String(pageSize),
            status: 'active',
          },
        });
        const rows = (data.items || []).map((row) => ({
          id: row.id,
          name: row.name,
          brand: row.brand,
          barcode: row.barcode,
          imageUrl: row.imageUrl,
        }));
        const filtered = missingOnly ? rows.filter((row) => !row.imageUrl) : rows;
        setTotal(missingOnly ? filtered.length : data.total);
        setItems(filtered);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, [qDebounced, missingOnly, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (productId: string, imageUrl: string) => {
    const updated = await assignProductImage(productId, imageUrl);
    setItems((current) => current.map((row) => (row.id === productId ? { ...row, imageUrl: updated.imageUrl } : row)));
  };

  const autoPage = async () => {
    if (!items.length) return;
    const missing = items.filter((row) => !row.imageUrl?.trim());
    const already = items.length - missing.length;
    if (!missing.length) {
      setMsg('Todos los de esta página ya tienen imagen. No hay nada que buscar.');
      return;
    }
    if (!confirm(`${missing.length} producto${missing.length === 1 ? '' : 's'} sin imagen. ${already ? `Los ${already} que ya tienen foto se saltean. ` : ''}¿Buscamos la primera foto de Serper?`)) return;
    setAutoBusy(true);
    setMsg('');
    try {
      const result = await autoAssignSerperPhotos(items, true, (done, total, name) => {
        setMsg(`Foto ${done}/${total}: ${name}`);
      });
      setMsg(`${result.updated} imágenes aplicadas${result.skipped.length ? ` · ${result.skipped.length} omitidos` : ''}.`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo aplicar en lote.');
    } finally {
      setAutoBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Editor masivo de imágenes"
        subtitle="Buscá fotos con Serper y asignalas a varios productos. Primero cargá la API key en Configuración."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/config/serper" className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:text-fg">
              API Serper
            </Link>
            <Link href="/productos" className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:text-fg">
              ← Productos
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-hair-soft bg-surface p-4 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nombre, marca o código"
          className="min-w-0 flex-1 rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
        />
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={missingOnly} onChange={(e) => { setPage(1); setMissingOnly(e.target.checked); }} />
          Solo sin imagen
        </label>
        <button type="button" disabled={autoBusy || !items.length} onClick={() => void autoPage()} className="btn-brand rounded-lg px-4 py-2 text-sm disabled:opacity-50">
          {autoBusy ? (msg.startsWith('Foto ') ? msg : 'Aplicando…') : 'Primera foto a esta página'}
        </button>
      </div>
      {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}
      <p className="text-sm text-fg-faint">{total} productos · página {page} de {pages}</p>

      {loading ? (
        <Loader label="Productos" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-hair-soft bg-surface p-8 text-center text-fg-muted">No hay productos en este filtro.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((row) => (
            <li key={row.id} className="rounded-xl border border-hair-soft bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/productos/${row.id}`} className="font-semibold text-fg hover:text-brand hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-fg-faint">{[row.brand, row.barcode].filter(Boolean).join(' · ') || 'Sin marca ni código'}</p>
                </div>
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.imageUrl} alt="" className="h-14 w-14 rounded-lg border border-hair-soft bg-white object-contain" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-raised2 text-xs text-fg-faint">Sin foto</div>
                )}
              </div>
              <SerperImagePicker
                query={[row.name, row.brand].filter(Boolean).join(' ')}
                value={row.imageUrl || ''}
                onChange={(url) => {
                  if (!url) {
                    void assign(row.id, '').catch(() => {});
                    return;
                  }
                  void assign(row.id, url).catch((err) => alert(err instanceof Error ? err.message : 'Error'));
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-hair px-3 py-1.5 text-sm disabled:opacity-40">
            Anterior
          </button>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-hair px-3 py-1.5 text-sm disabled:opacity-40">
            Siguiente
          </button>
        </div>
      )}
    </Container>
  );
}
