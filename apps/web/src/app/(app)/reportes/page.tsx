'use client';

import { Children, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';

type Period = 'today' | 'week' | 'month' | 'year';
type SalesSummary = { total: number; count: number };
type TopProduct = { name: string; qty: number; total: number };
type Margin = { revenue: number; cost: number; margin: number };
type TotalCount = { total: number; count: number };
type ReportData = {
  sales: SalesSummary | null;
  topProducts: TopProduct[];
  legacyMargin: Margin | null;
  lowStock: { name: string; stock: number; minStock: number }[];
  expiring: { name: string; expiresAt: string; qtyExpiring: number }[];
  salesByHour: { hour: number; total: number; count: number }[];
  salesByWeekday: { weekday: number; total: number; count: number }[];
  salesByPayment: { paymentMethod: string; total: number; count: number }[];
  salesByUser: { userId: string; userName: string; total: number; count: number }[];
  salesByCategory: { categoryId: string | null; categoryName: string; total: number; qty: number }[];
  salesByBrand: { brand: string; total: number; qty: number }[];
  averageTicket: { avg: number; count: number; total: number } | null;
  comparison: { current: TotalCount; previous: TotalCount; deltaPct: number } | null;
  deadStock: { id: string; name: string; stock: number; lastSaleAt: string | null; daysSinceSale: number | null }[];
  stockOuts: { id: string; name: string; minStock: number }[];
  valuation: { atCost: number; atSale: number; potentialMargin: number; units: number } | null;
  topCustomers: { customerId: string; name: string; total: number; count: number }[];
  fiado: { customerId: string; name: string; balance: number }[];
  purchases: { supplierId: string | null; supplierName: string; total: number; count: number }[];
  expenses: { category: string; total: number; count: number }[];
  grossMargin: { revenue: number; cogs: number; grossMargin: number; marginPct: number } | null;
  fiscal: { facturaC: TotalCount; internal: TotalCount } | null;
  cashSessions: { id: string; openedAt: string; closedAt: string | null; opening: number; counted: number | null; expected: number | null; difference: number | null }[];
};

const EMPTY_DATA: ReportData = {
  sales: null, topProducts: [], legacyMargin: null, lowStock: [], expiring: [], salesByHour: [], salesByWeekday: [],
  salesByPayment: [], salesByUser: [], salesByCategory: [], salesByBrand: [], averageTicket: null, comparison: null,
  deadStock: [], stockOuts: [], valuation: null, topCustomers: [], fiado: [], purchases: [], expenses: [],
  grossMargin: null, fiscal: null, cashSessions: [],
};

const TABS = [
  ['sales', 'Ventas'], ['inventory', 'Inventario'], ['customers', 'Clientes'],
  ['purchases', 'Compras / Gastos'], ['fiscal', 'Fiscal / Caja'],
] as const;

const money = (value: number | null | undefined) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const number = (value: number | null | undefined) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value ?? 0));
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('es-AR') : '—';

function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-hair-soft bg-surface p-4 sm:p-5 ${className}`}><h3 className="mb-4 font-semibold text-fg">{title}</h3>{children}</section>;
}

function Kpi({ label, value, detail, tone = 'text-fg' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: string }) {
  return <div className="rounded-xl border border-hair-soft bg-surface p-4"><p className="text-sm text-fg-muted">{label}</p><p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</p>{detail && <p className="mt-1 text-xs text-fg-faint">{detail}</p>}</div>;
}

function Empty() { return <p className="py-8 text-center text-sm text-fg-faint">Sin datos para el período seleccionado.</p>; }

function Chart({ data, xKey }: { data: Record<string, unknown>[]; xKey: string }) {
  if (!data.length) return <Empty />;
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--hair-soft)" vertical={false} /><XAxis dataKey={xKey} stroke="var(--tx-3)" fontSize={11} /><YAxis stroke="var(--tx-3)" fontSize={11} tickFormatter={(value) => `$${Number(value) / 1000}k`} /><Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--hair)', borderRadius: 8, color: 'var(--tx)' }} formatter={(value) => money(Number(value))} /><Bar dataKey="total" fill="var(--brand-accent)" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty: boolean }) {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{ children?: ReactNode }>[];
  return <><div className="hidden overflow-x-auto rounded-xl border border-hair-soft md:block"><table className="w-full text-sm"><thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2.5">{header}</th>)}</tr></thead><tbody className="divide-y divide-hair-soft">{children}{empty && <tr><td colSpan={headers.length}><Empty /></td></tr>}</tbody></table></div><div className="space-y-3 md:hidden">{empty ? <Empty /> : rows.map((row, rowIndex) => { const cells = Children.toArray(row.props.children); return <article key={row.key ?? rowIndex} className="rounded-xl border border-hair-soft bg-surface p-3">{cells.map((cell, cellIndex) => isValidElement<{ children?: ReactNode; className?: string }>(cell) ? <div key={cell.key ?? cellIndex} className="flex items-start justify-between gap-3 border-b border-hair-soft py-2 last:border-0"><span className="text-xs text-fg-faint">{headers[cellIndex] ?? ''}</span><div className={`min-w-0 text-right text-sm text-fg ${cell.props.className?.includes('font-mono') ? 'font-mono tabular-nums' : ''}`}>{cell.props.children}</div></div> : null)}</article>; })}</div></>;
}

export default function ReportesPage() {
  const [period, setPeriod] = usePersistedState<Period>('sr-filters:reportes:period', 'today');
  const [activeTab, setActiveTab] = usePersistedState<(typeof TABS)[number][0]>('sr-filters:reportes:tab', 'sales');
  const [data, setData] = useState<ReportData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const requests: Array<[keyof ReportData, Promise<unknown>]> = [
      ['sales', api<SalesSummary>('/reports/sales', { params: { period } })],
      ['topProducts', api<TopProduct[]>('/reports/top-products', { params: { period } })],
      ['legacyMargin', api<Margin>('/reports/margin', { params: { period } })],
      ['lowStock', api('/reports/low-stock')], ['expiring', api('/reports/expiring', { params: { days: '30' } })],
      ['salesByHour', api('/reports/sales-by-hour', { params: { period } })],
      ['salesByWeekday', api('/reports/sales-by-weekday', { params: { period } })],
      ['salesByPayment', api('/reports/sales-by-payment', { params: { period } })],
      ['salesByUser', api('/reports/sales-by-user', { params: { period } })],
      ['salesByCategory', api('/reports/sales-by-category', { params: { period } })],
      ['salesByBrand', api('/reports/sales-by-brand', { params: { period } })],
      ['averageTicket', api('/reports/average-ticket', { params: { period } })],
      ['comparison', api('/reports/sales-comparison')], ['deadStock', api('/reports/dead-stock', { params: { days: '30' } })],
      ['stockOuts', api('/reports/stock-outs')], ['valuation', api('/reports/inventory-valuation')],
      ['topCustomers', api('/reports/top-customers', { params: { period, limit: '10' } })], ['fiado', api('/reports/fiado-aging')],
      ['purchases', api('/reports/purchases-by-supplier', { params: { period } })],
      ['expenses', api('/reports/expenses-by-category', { params: { period } })],
      ['grossMargin', api('/reports/gross-margin', { params: { period } })],
      ['fiscal', api('/reports/fiscal-summary', { params: { period } })],
      ['cashSessions', api('/reports/cash-sessions', { params: { period } })],
    ];
    Promise.allSettled(requests.map(([, request]) => request)).then((results) => {
      if (cancelled) return;
      const next = { ...EMPTY_DATA } as ReportData;
      const failures: string[] = [];
      results.forEach((result, index) => {
        const key = requests[index][0];
        if (result.status === 'fulfilled') (next as Record<keyof ReportData, unknown>)[key] = result.value;
        else failures.push(String(key));
      });
      // El nuevo agregado cubre correctamente también el período anual para los KPIs principales.
      if (next.averageTicket) next.sales = { total: next.averageTicket.total, count: next.averageTicket.count };
      if (next.grossMargin) next.legacyMargin = { revenue: next.grossMargin.revenue, cost: next.grossMargin.cogs, margin: next.grossMargin.grossMargin };
      setData(next); setFailed(failures);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const handleExportCsv = async () => {
    try {
      const { csv, filename } = await api<{ csv: string; filename: string }>('/reports/export/sales');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    } catch (err) { alert(err instanceof Error ? err.message : 'Error'); }
  };

  const weekdayData = data.salesByWeekday.map((row) => ({ ...row, day: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][row.weekday] })).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const td = 'whitespace-nowrap px-3 py-2.5 text-fg-muted';
  const num = `${td} text-right font-mono tabular-nums`;

  return <Container className="space-y-6">
    <PageHeader title="Reportes" subtitle="Analizá ventas, inventario, clientes, compras y caja." actions={<div data-tour="reportes-periodo" className="flex gap-2"><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option></select><button data-tour="reportes-export" onClick={handleExportCsv} className="btn-brand rounded-lg px-4 py-2">Exportar CSV</button></div>} />

    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"><Kpi label="Ventas totales" value={money(data.sales?.total)} detail={`${data.sales?.count ?? 0} ventas`} /><Kpi label="Ticket promedio" value={money(data.averageTicket?.avg)} /><Kpi label="Margen estimado" value={money(data.legacyMargin?.margin)} detail={`Ingresos ${money(data.legacyMargin?.revenue)} · Costo ${money(data.legacyMargin?.cost)}`} tone="text-ok" /><Kpi label="Comparativa mensual" value={`${number(data.comparison?.deltaPct)}%`} detail={`${money(data.comparison?.current.total)} actual · ${money(data.comparison?.previous.total)} anterior`} tone={(data.comparison?.deltaPct ?? 0) >= 0 ? 'text-ok' : 'text-crit'} /></div>

    <div className="flex flex-wrap gap-2 border-b border-hair-soft pb-3">{TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-lg border px-3 py-2 text-sm ${activeTab === key ? 'border-[color:var(--brand-accent)] bg-brand-highlight text-brand' : 'border-hair bg-surface text-fg-muted hover:bg-raised'}`}>{label}</button>)}</div>
    {failed.length > 0 && <p className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] px-4 py-3 text-sm text-warn">Algunos reportes no pudieron cargarse ({failed.length}). El resto sigue disponible.</p>}
    {loading && <div className="rounded-xl border border-hair-soft bg-surface"><Loader /></div>}

    {!loading && activeTab === 'sales' && <div className="space-y-6"><div className="grid gap-4 xl:grid-cols-2"><Card title="Ventas por hora"><Chart data={data.salesByHour.map((row) => ({ ...row, label: `${String(row.hour).padStart(2, '0')}h` }))} xKey="label" /></Card><Card title="Ventas por día de semana"><Chart data={weekdayData} xKey="day" /></Card><Card title="Ventas por categoría"><Chart data={data.salesByCategory.slice(0, 12).map((row) => ({ ...row, label: row.categoryName }))} xKey="label" /></Card><Card title="Top productos"><Table headers={['Producto', 'Cantidad', 'Total']} empty={!data.topProducts.length}>{data.topProducts.slice(0, 10).map((row, index) => <tr key={`${row.name}-${index}`}><td className={td}>{row.name}</td><td className={num}>{row.qty}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Por método de pago"><Table headers={['Método', 'Ventas', 'Total']} empty={!data.salesByPayment.length}>{data.salesByPayment.map((row) => <tr key={row.paymentMethod}><td className={td}>{row.paymentMethod}</td><td className={num}>{row.count}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card><Card title="Por vendedor"><Table headers={['Vendedor', 'Ventas', 'Total']} empty={!data.salesByUser.length}>{data.salesByUser.map((row) => <tr key={row.userId}><td className={td}>{row.userName}</td><td className={num}>{row.count}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card><Card title="Por marca" className="xl:col-span-2"><Table headers={['Marca', 'Unidades', 'Total']} empty={!data.salesByBrand.length}>{data.salesByBrand.map((row) => <tr key={row.brand}><td className={td}>{row.brand}</td><td className={num}>{row.qty}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card></div></div>}

    {!loading && activeTab === 'inventory' && <div className="space-y-6"><div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"><Kpi label="Inventario a costo" value={money(data.valuation?.atCost)} /><Kpi label="Inventario a venta" value={money(data.valuation?.atSale)} /><Kpi label="Margen potencial" value={money(data.valuation?.potentialMargin)} tone="text-ok" /><Kpi label="Unidades" value={number(data.valuation?.units)} /></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Stock sin ventas en 30 días"><Table headers={['Producto', 'Stock', 'Días sin venta']} empty={!data.deadStock.length}>{data.deadStock.map((row) => <tr key={row.id}><td className={td}>{row.name}</td><td className={num}>{row.stock}</td><td className={num}>{row.daysSinceSale ?? 'Nunca vendido'}</td></tr>)}</Table></Card><Card title="Quiebres de stock"><Table headers={['Producto', 'Stock mínimo']} empty={!data.stockOuts.length}>{data.stockOuts.map((row) => <tr key={row.id}><td className={td}>{row.name}</td><td className={`${num} text-crit`}>{row.minStock}</td></tr>)}</Table></Card><Card title="Productos con stock bajo"><Table headers={['Producto', 'Stock', 'Mínimo']} empty={!data.lowStock.length}>{data.lowStock.map((row, index) => <tr key={`${row.name}-${index}`}><td className={td}>{row.name}</td><td className={`${num} text-warn`}>{row.stock}</td><td className={num}>{row.minStock}</td></tr>)}</Table></Card><Card title="Productos por vencer (30 días)"><Table headers={['Producto', 'Cantidad', 'Vence']} empty={!data.expiring.length}>{data.expiring.map((row, index) => <tr key={`${row.name}-${index}`}><td className={td}>{row.name}</td><td className={num}>{row.qtyExpiring}</td><td className={`${num} text-warn`}>{new Date(row.expiresAt).toLocaleDateString('es-AR')}</td></tr>)}</Table></Card></div></div>}

    {!loading && activeTab === 'customers' && <div className="grid gap-4 xl:grid-cols-2"><Card title="Top clientes"><Table headers={['Cliente', 'Compras', 'Total']} empty={!data.topCustomers.length}>{data.topCustomers.map((row) => <tr key={row.customerId}><td className={td}>{row.name}</td><td className={num}>{row.count}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card><Card title="Saldos fiados"><Table headers={['Cliente', 'Saldo']} empty={!data.fiado.length}>{data.fiado.map((row) => <tr key={row.customerId}><td className={td}>{row.name}</td><td className={`${num} text-warn`}>{money(row.balance)}</td></tr>)}</Table></Card></div>}

    {!loading && activeTab === 'purchases' && <div className="space-y-6"><div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"><Kpi label="Ingresos" value={money(data.grossMargin?.revenue)} /><Kpi label="Costo vendido" value={money(data.grossMargin?.cogs)} /><Kpi label="Margen bruto" value={money(data.grossMargin?.grossMargin)} tone="text-ok" /><Kpi label="Margen" value={`${number(data.grossMargin?.marginPct)}%`} tone="text-ok" /></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Compras por proveedor"><Table headers={['Proveedor', 'Compras', 'Total']} empty={!data.purchases.length}>{data.purchases.map((row, index) => <tr key={row.supplierId ?? index}><td className={td}>{row.supplierName}</td><td className={num}>{row.count}</td><td className={num}>{money(row.total)}</td></tr>)}</Table></Card><Card title="Gastos por categoría"><Table headers={['Categoría', 'Movimientos', 'Total']} empty={!data.expenses.length}>{data.expenses.map((row) => <tr key={row.category}><td className={td}>{row.category}</td><td className={num}>{row.count}</td><td className={`${num} text-crit`}>{money(row.total)}</td></tr>)}</Table></Card></div></div>}

    {!loading && activeTab === 'fiscal' && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2"><Kpi label="Factura C" value={money(data.fiscal?.facturaC.total)} detail={`${data.fiscal?.facturaC.count ?? 0} comprobantes`} tone="text-ok" /><Kpi label="Comprobantes internos" value={money(data.fiscal?.internal.total)} detail={`${data.fiscal?.internal.count ?? 0} comprobantes`} tone="text-warn" /></div><Card title="Arqueos de caja"><Table headers={['Apertura', 'Cierre', 'Inicial', 'Contado', 'Esperado', 'Diferencia']} empty={!data.cashSessions.length}>{data.cashSessions.map((row) => <tr key={row.id}><td className={`${td} font-mono text-xs`}>{date(row.openedAt)}</td><td className={`${td} font-mono text-xs`}>{date(row.closedAt)}</td><td className={num}>{money(row.opening)}</td><td className={num}>{row.counted == null ? '—' : money(row.counted)}</td><td className={num}>{row.expected == null ? '—' : money(row.expected)}</td><td className={num}>{row.difference == null ? '—' : money(row.difference)}</td></tr>)}</Table></Card></div>}
  </Container>;
}
