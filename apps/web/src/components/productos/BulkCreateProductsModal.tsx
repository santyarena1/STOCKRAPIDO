'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

type BulkResult = {
  created: number;
  updated?: number;
  matchedFromCatalog?: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  matches?: Array<{ row: number; pasted: string; catalog: string; barcode?: string }>;
  ids: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: BulkResult) => void;
};

const EXAMPLE = `producto;cantidad;precio
Coca Cola 500ml;24;1500
Alfajor Havanna;50;800
Agua Villavicencio 2L;12;1200`;

export function BulkCreateProductsModal({ open, onClose, onCreated }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const loadExample = () => {
    setText(EXAMPLE);
    setResult(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setText(await file.text());
    setResult(null);
  };

  const submit = async () => {
    if (!text.trim()) {
      alert('Pegá o subí una lista: producto, cantidad y precio unitario.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await api<BulkResult>('/products/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setResult(res);
      if (res.created > 0 || (res.updated ?? 0) > 0) {
        onCreated(res);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error en la carga masiva');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-hair-soft p-5">
          <div>
            <h2 className="text-xl font-bold text-fg">Carga masiva de productos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Solo producto, cantidad y precio unitario. Si hay ficha en el catálogo público, le pegamos foto, código y buen nombre.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised disabled:opacity-50"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-hair-soft bg-raised p-3 text-xs text-fg-muted">
            <p className="font-medium text-fg">Formato</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>
                Tres columnas: <span className="font-mono">producto;cantidad;precio</span>
              </li>
              <li>Separá con coma o <span className="font-mono">;</span>. El <span className="font-mono">;</span> al final de la línea no molesta.</li>
              <li>Ejemplo: <span className="font-mono">Coca Cola 500ml,24,1500;</span></li>
              <li>Máximo 500 por carga. El catálogo público completa foto/código/nombre cuando hay match.</li>
            </ul>
            <button type="button" onClick={loadExample} className="mt-2 text-sm font-medium text-brand hover:underline">
              Cargar ejemplo
            </button>
          </div>

          <label className="block text-sm font-medium text-fg-muted">
            Lista de productos
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              rows={12}
              spellCheck={false}
              placeholder={EXAMPLE}
              className="mt-2 w-full resize-y rounded-xl border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm font-medium text-fg hover:bg-raised2"
            >
              Subir archivo .csv / .txt
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            {text.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setResult(null);
                }}
                className="text-sm text-fg-muted hover:text-fg"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          {result && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                result.created > 0 || (result.updated ?? 0) > 0
                  ? 'border-ok/30 bg-[var(--ok-soft)] text-ok'
                  : 'border-warn/30 bg-[var(--warn-soft)] text-warn'
              }`}
            >
              <p>
                <strong className="font-mono">{result.created}</strong> creado
                {result.created === 1 ? '' : 's'}
                {(result.updated ?? 0) > 0 ? (
                  <>
                    {' '}
                    · <strong className="font-mono">{result.updated}</strong> actualizado
                    {result.updated === 1 ? '' : 's'} (sumó cantidad)
                  </>
                ) : null}
                {result.matchedFromCatalog ? (
                  <>
                    {' '}
                    · <strong className="font-mono">{result.matchedFromCatalog}</strong> con foto/código del
                    catálogo público
                  </>
                ) : null}
                {result.skipped > 0 ? (
                  <>
                    {' '}
                    · <strong className="font-mono">{result.skipped}</strong> con error
                  </>
                ) : null}
                .
              </p>
              {result.matches && result.matches.length > 0 && (
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-fg">
                  {result.matches.slice(0, 15).map((m) => (
                    <li key={`m-${m.row}`}>
                      “{m.pasted}” → <strong>{m.catalog}</strong>
                      {m.barcode ? ` · ${m.barcode}` : ''}
                    </li>
                  ))}
                  {result.matches.length > 15 ? (
                    <li>… y {result.matches.length - 15} matches más</li>
                  ) : null}
                </ul>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-fg">
                  {result.errors.slice(0, 20).map((err, i) => (
                    <li key={`${err.row}-${i}`}>
                      {err.row > 0 ? `Fila ${err.row}: ` : ''}
                      {err.message}
                    </li>
                  ))}
                  {result.errors.length > 20 ? (
                    <li>… y {result.errors.length - 20} más</li>
                  ) : null}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-hair-soft p-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-hair px-4 py-2.5 text-sm text-fg-muted hover:bg-raised disabled:opacity-50"
          >
            {result?.created ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void submit()}
            className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Creando…' : 'Crear productos'}
          </button>
        </div>
      </div>
    </div>
  );
}
