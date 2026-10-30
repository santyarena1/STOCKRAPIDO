'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

type BulkResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  ids: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: BulkResult) => void;
};

const EXAMPLE = `nombre;precio;stock;costo;codigo_barras;categoria;marca
Coca Cola 500ml;1500;24;900;7790895001234;Bebidas;Coca-Cola
Alfajor Havanna;800;50;450;;Golosinas;Havanna`;

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
      alert('Pegá o subí una lista de productos (CSV o texto plano).');
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
      if (res.created > 0) {
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
              Pegá un CSV o texto plano. Columnas: nombre, precio, stock, costo, código, categoría, marca…
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
              <li>Separá columnas con <span className="font-mono">;</span>, coma o tab.</li>
              <li>Con encabezado: <span className="font-mono">nombre;precio;stock;costo;codigo_barras;categoria;marca</span></li>
              <li>Sin encabezado: <span className="font-mono">Nombre;1500;24</span> (nombre y precio son obligatorios).</li>
              <li>Máximo 500 productos por carga. Las categorías nuevas se crean solas.</li>
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
                result.created > 0
                  ? 'border-ok/30 bg-[var(--ok-soft)] text-ok'
                  : 'border-warn/30 bg-[var(--warn-soft)] text-warn'
              }`}
            >
              <p>
                Se crearon <strong className="font-mono">{result.created}</strong> producto
                {result.created === 1 ? '' : 's'}
                {result.skipped > 0 ? (
                  <>
                    {' '}
                    · <strong className="font-mono">{result.skipped}</strong> con error u omitido
                    {result.skipped === 1 ? '' : 's'}
                  </>
                ) : null}
                .
              </p>
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
