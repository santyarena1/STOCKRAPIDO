'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { PlanGate } from '@/components/billing/PlanGate';

type ReceivedItem = {
  id: string;
  issuedAt: string;
  voucherType: string;
  pointOfSale: number;
  numberFrom: number;
  authCode: string | null;
  issuerDocNumber: string;
  issuerName: string | null;
  totalAmount: number;
  status: string;
  verifyMessage: string | null;
};

type ListResponse = {
  receptorCuit: string | null;
  fiscalEnabled: boolean;
  count: number;
  totalAmount: number;
  totalVat: number;
  items: ReceivedItem[];
};

type SummaryResponse = {
  count: number;
  totalAmount: number;
  totalVat: number;
  topIssuers: {
    issuerDocNumber: string;
    issuerName: string | null;
    count: number;
    totalAmount: number;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  imported: 'Importado',
  verified: 'Verificado',
  mismatch: 'No coincide',
  error: 'Error',
};

const STATUS_TONE: Record<string, string> = {
  imported: 'border-hair bg-raised2 text-fg-muted',
  verified: 'border-ok/30 bg-[var(--ok-soft)] text-ok',
  mismatch: 'border-warn/40 bg-[var(--warn-soft)] text-warn',
  error: 'border-crit/40 bg-[var(--crit-soft)] text-crit',
};

function money(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
}

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ComprasArcaPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(ymd);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [csvText, setCsvText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      const [list, sum] = await Promise.all([
        api<ListResponse>(`/fiscal/received?${params}`),
        api<SummaryResponse>(`/fiscal/received/summary?from=${from}&to=${to}`),
      ]);
      setData(list);
      setSummary(sum);
      setSelected(new Set());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [from, to, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () => !!data?.items.length && data.items.every((item) => selected.has(item.id)),
    [data, selected],
  );

  const toggleAll = () => {
    if (!data?.items.length) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.items.map((item) => item.id)));
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setCsvText(await file.text());
  };

  const importCsv = async () => {
    if (!csvText.trim()) {
      alert('Subí o pegá el CSV de Mis Comprobantes (Recibidos).');
      return;
    }
    setBusy('import');
    setMsg('');
    try {
      const res = await api<{ parsed: number; created: number; updated: number; skipped: number; errors: string[] }>(
        '/fiscal/received/import',
        { method: 'POST', body: JSON.stringify({ csv: csvText }) },
      );
      setMsg(
        `Importados: ${res.created} nuevos, ${res.updated} actualizados` +
          (res.skipped ? `, ${res.skipped} omitidos` : '') +
          (res.errors?.length ? `. Ej: ${res.errors[0]}` : ''),
      );
      setCsvText('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setBusy(null);
    }
  };

  const verifySelected = async () => {
    const ids = [...selected];
    if (!ids.length) {
      alert('Seleccioná comprobantes para constatar en ARCA.');
      return;
    }
    setBusy('verify');
    try {
      await api('/fiscal/received/verify', { method: 'POST', body: JSON.stringify({ ids }) });
      setMsg(`Constatación enviada para ${ids.length} comprobante(s).`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al constatar');
    } finally {
      setBusy(null);
    }
  };

  const removeOne = async (id: string) => {
    if (!confirm('¿Eliminar este comprobante de la lista local?')) return;
    setBusy(id);
    try {
      await api(`/fiscal/received/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <PlanGate feature="fiscal">
      <Container className="space-y-6">
        <PageHeader
          title="Compras en ARCA"
          subtitle="Comprobantes que proveedores emitieron a tu CUIT (Mis Comprobantes → Recibidos)."
          actions={
            <Link
              href="/config/fiscal"
              className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg-muted hover:bg-raised2"
            >
              Config fiscal
            </Link>
          }
        />

        <section className="space-y-3 rounded-2xl border border-hair-soft bg-surface p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-fg">
              <FileSpreadsheet className="h-5 w-5" /> Importar CSV de ARCA
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">
              En{' '}
              <a href="https://arca.gob.ar" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                arca.gob.ar
              </a>{' '}
              → Mis Comprobantes → Recibidos → exportá CSV e importalo acá. Usa el mismo CUIT del módulo fiscal
              {data?.receptorCuit ? ` (${data.receptorCuit})` : ''}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-hair bg-raised px-3 py-2 text-sm font-medium hover:bg-raised2">
              <Upload className="h-4 w-4" />
              Elegir archivo CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={!!busy || !csvText.trim()}
              onClick={() => void importCsv()}
              className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === 'import' ? 'Importando…' : 'Importar a StockRápido'}
            </button>
          </div>
          {csvText ? (
            <p className="text-xs text-fg-faint">CSV cargado ({csvText.length.toLocaleString('es-AR')} caracteres).</p>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-hair-soft bg-surface p-4">
            <p className="text-xs uppercase text-fg-faint">Comprobantes</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{summary?.count ?? data?.count ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-hair-soft bg-surface p-4">
            <p className="text-xs uppercase text-fg-faint">Total compras</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
              {money(summary?.totalAmount ?? data?.totalAmount ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-hair-soft bg-surface p-4">
            <p className="text-xs uppercase text-fg-faint">IVA informado</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
              {money(summary?.totalVat ?? data?.totalVat ?? 0)}
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-hair-soft bg-surface p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-hair bg-raised px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-hair bg-raised px-3 py-2"
              />
            </label>
            <label className="min-w-[12rem] flex-1 text-sm">
              Buscar
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="CUIT, razón social, CAE…"
                className="mt-1 block w-full rounded-lg border border-hair bg-raised px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Estado
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 block rounded-lg border border-hair bg-raised px-3 py-2"
              >
                <option value="">Todos</option>
                <option value="imported">Importado</option>
                <option value="verified">Verificado</option>
                <option value="mismatch">No coincide</option>
                <option value="error">Error</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
            <button
              type="button"
              disabled={!!busy || selected.size === 0}
              onClick={() => void verifySelected()}
              className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {busy === 'verify' ? 'Constatando…' : `Constatar (${selected.size})`}
            </button>
          </div>

          {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}

          {loading ? (
            <Loader />
          ) : !data?.items.length ? (
            <p className="py-10 text-center text-sm text-fg-faint">
              Todavía no hay comprobantes. Importá el CSV de Mis Comprobantes → Recibidos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-xs uppercase text-fg-faint">
                    <th className="py-2 pr-2">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    </th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Comprobante</th>
                    <th className="py-2 pr-3">Emisor</th>
                    <th className="py-2 pr-3">CAE</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-hair-soft align-top">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 font-mono tabular-nums">
                        {new Date(item.issuedAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-fg">{item.voucherType}</p>
                        <p className="font-mono text-xs text-fg-faint">
                          {String(item.pointOfSale).padStart(5, '0')}-{String(item.numberFrom).padStart(8, '0')}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        <p className="text-fg">{item.issuerName || '—'}</p>
                        <p className="font-mono text-xs text-fg-faint">{item.issuerDocNumber}</p>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-fg-muted">{item.authCode || '—'}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(item.totalAmount)}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[item.status] || STATUS_TONE.imported}`}
                        >
                          {STATUS_LABEL[item.status] || item.status}
                        </span>
                        {item.verifyMessage ? (
                          <p className="mt-1 max-w-[14rem] text-[11px] text-fg-faint">{item.verifyMessage}</p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() => void removeOne(item.id)}
                          className="rounded-lg p-1.5 text-fg-faint hover:bg-raised hover:text-crit"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {summary?.topIssuers?.length ? (
          <section className="rounded-2xl border border-hair-soft bg-surface p-4">
            <h2 className="font-semibold text-fg">Principales emisores del período</h2>
            <ul className="mt-3 divide-y divide-hair-soft">
              {summary.topIssuers.map((issuer) => (
                <li key={issuer.issuerDocNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-fg">{issuer.issuerName || issuer.issuerDocNumber}</p>
                    <p className="font-mono text-xs text-fg-faint">
                      {issuer.issuerDocNumber} · {issuer.count} cbtes
                    </p>
                  </div>
                  <p className="font-mono font-semibold tabular-nums">{money(issuer.totalAmount)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>
    </PlanGate>
  );
}
