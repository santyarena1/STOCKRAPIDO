'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { LabelPrintDialog, type LabelItem } from '@/components/LabelPrintDialog';

type Props = {
  barcode: string;
  onBarcode: (barcode: string) => void;
  labelItem: LabelItem;
};

export function BarcodeField({ barcode, onBarcode, labelItem }: Props) {
  const [busy, setBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const generate = async () => {
    if (barcode.trim() && !confirm('Este producto ya tiene código. ¿Reemplazarlo por uno interno nuevo?')) return;
    setBusy(true);
    try {
      const res = await api<{ barcode: string }>('/products/generate-barcode', { method: 'POST', body: '{}' });
      onBarcode(res.barcode);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo generar el código');
    } finally {
      setBusy(false);
    }
  };

  const current: LabelItem = { ...labelItem, barcode: barcode || labelItem.barcode };

  return (
    <div>
      <label className="mb-1 block text-sm text-fg-muted">Código de barras</label>
      <input
        type="text"
        value={barcode}
        onChange={(e) => onBarcode(e.target.value)}
        className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:bg-raised disabled:opacity-50"
        >
          {busy ? 'Generando…' : barcode.trim() ? 'Generar otro código interno' : 'Generar código interno'}
        </button>
        <button
          type="button"
          disabled={!barcode.trim()}
          onClick={() => setPrintOpen(true)}
          className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:bg-raised disabled:opacity-50"
        >
          Imprimir etiqueta
        </button>
      </div>
      <p className="mt-1 text-xs text-fg-faint">
        Si el producto no trae EAN, generamos un código interno (EAN-13 de uso interno) para pistolearlo desde una hoja.
      </p>
      {printOpen ? <LabelPrintDialog items={[current]} onClose={() => setPrintOpen(false)} /> : null}
    </div>
  );
}
