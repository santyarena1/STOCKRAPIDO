'use client';
import { api } from '@/lib/api';
import {
  downloadFiscalReceipt,
  printFiscalReceipt as printShared,
  type FiscalReceiptLike,
} from '@/lib/fiscal-receipt';

export async function printFiscalReceipt(receipt: any, existingPopup?: Window | null) {
  return printShared(receipt as FiscalReceiptLike, existingPopup);
}

export { downloadFiscalReceipt };

export function FiscalReceiptModal({
  receipt,
  onClose,
  onRefresh,
}: {
  receipt: any;
  onClose: () => void;
  onRefresh: (r: any) => void;
}) {
  const doc = receipt.fiscalDocument;
  const retry = async () => {
    await api(`/fiscal/sales/${receipt.id}/retry`, { method: 'POST' });
    onRefresh(await api(`/fiscal/sales/${receipt.id}/receipt`));
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
      <div className="mx-4 w-full max-w-md rounded-xl border border-hair bg-surface p-6">
        <h2 className="mb-2 text-xl font-bold text-fg">Venta registrada</h2>
        {doc?.kind === 'INTERNAL' ? (
          <div className="mb-4 rounded-lg border border-hair bg-raised p-4">
            <p className="font-bold text-fg">Comprobante interno</p>
            <p className="text-sm text-warn">No válido como factura</p>
          </div>
        ) : doc?.status === 'AUTHORIZED' ? (
          <div className="mb-4 rounded-lg border border-[color:var(--ok)] bg-[var(--ok-soft)] p-4">
            <p className="font-bold text-ok">Factura C autorizada</p>
            <p className="text-sm text-fg-muted">
              Nº {String(doc.pointOfSale).padStart(5, '0')}-{String(doc.receiptNumber).padStart(8, '0')} · CAE{' '}
              {doc.cae}
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-[color:var(--crit)] bg-[var(--crit-soft)] p-4">
            <p className="font-bold text-crit">La venta se guardó, pero ARCA no autorizó</p>
            <p className="mt-1 text-sm text-crit">{doc?.errorMessage}</p>
            <button
              type="button"
              onClick={() => void retry()}
              className="mt-3 rounded bg-crit px-3 py-2 text-sm text-white"
            >
              Reintentar ARCA
            </button>
          </div>
        )}
        <p className="mb-4 text-right text-2xl font-bold text-fg">
          Total {'$'}
          {Number(receipt.totalFinal).toFixed(2)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              void printFiscalReceipt(receipt);
            }}
            className="rounded-lg btn-brand py-3 font-bold"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-hair bg-raised2 py-3 font-bold text-fg"
          >
            No imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
