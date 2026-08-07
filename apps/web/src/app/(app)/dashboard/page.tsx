'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { WidthProvider, Responsive } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

const ResponsiveGrid = WidthProvider(Responsive);

const STORAGE_KEY = 'stockrapido-dashboard-layout';

const defaultLayout = [
  { i: 'ventas', x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  { i: 'compras', x: 4, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  { i: 'gastos', x: 8, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  { i: 'resumen', x: 0, y: 4, w: 12, h: 3, minW: 4, minH: 2 },
  { i: 'top-vendidos', x: 0, y: 7, w: 3, h: 4, minW: 2, minH: 2 },
  { i: 'top-ganancia', x: 3, y: 7, w: 3, h: 4, minW: 2, minH: 2 },
  { i: 'top-menos', x: 6, y: 7, w: 3, h: 4, minW: 2, minH: 2 },
  { i: 'top-vencer', x: 9, y: 7, w: 3, h: 4, minW: 2, minH: 2 },
];

type ByDay = { day: number; total: number; count: number };
type TopProduct = { name: string; qty: number; total?: number; profit?: number };
type TopExpiringSoon = { name: string; qty: number; nextExpiry: string };

const chartDefaults = {
  margin: { top: 8, right: 8, left: 0, bottom: 0 },
  gridStroke: '#334155',
  tickStyle: { fill: '#94a3b8', fontSize: 11 },
  tickLine: { stroke: '#475569' },
  tooltipStyle: { backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 },
  labelStyle: { color: '#e2e8f0' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function loadLayout(): typeof defaultLayout {
  if (typeof window === 'undefined') return defaultLayout;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as typeof defaultLayout;
      if (Array.isArray(parsed) && parsed.length === defaultLayout.length) return parsed;
    }
  } catch (_) {}
  return defaultLayout;
}

function saveLayout(layout: typeof defaultLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch (_) {}
}

export default function DashboardPage() {
  const [salesToday, setSalesToday] = useState<{ total: number; count: number } | null>(null);
  const [salesMonth, setSalesMonth] = useState<{ total: number; count: number } | null>(null);
  const [marginToday, setMarginToday] = useState<{ revenue: number; cost: number; margin: number } | null>(null);
  const [marginMonth, setMarginMonth] = useState<{ revenue: number; cost: number; margin: number } | null>(null);
  const [salesByDay, setSalesByDay] = useState<ByDay[]>([]);
  const [purchasesByDay, setPurchasesByDay] = useState<ByDay[]>([]);
  const [expensesByDay, setExpensesByDay] = useState<ByDay[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [openCaja, setOpenCaja] = useState<{ id: string } | null>(null);
  const [topSold, setTopSold] = useState<TopProduct[]>([]);
  const [topProfit, setTopProfit] = useState<TopProduct[]>([]);
  const [leastSold, setLeastSold] = useState<TopProduct[]>([]);
  const [topExpiringSoon, setTopExpiringSoon] = useState<TopExpiringSoon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [layout, setLayout] = useState<typeof defaultLayout>(defaultLayout);

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    Promise.allSettled([
      api<{ total: number; count: number }>('/reports/sales?period=today'),
      api<{ total: number; count: number }>('/reports/sales?period=month'),
      api<{ revenue: number; cost: number; margin: number }>('/reports/margin?period=today'),
      api<{ revenue: number; cost: number; margin: number }>('/reports/margin?period=month'),
      api<ByDay[]>(`/reports/sales-by-day?year=${year}&month=${month}`),
      api<ByDay[]>(`/reports/purchases-by-day?year=${year}&month=${month}`),
      api<ByDay[]>(`/reports/expenses-by-day?year=${year}&month=${month}`),
      api<unknown[]>('/reports/low-stock'),
      api<unknown[]>('/reports/expiring?days=30'),
      api<{ id: string } | null>('/caja/open'),
      api<TopProduct[]>('/reports/top-products?period=month&limit=10'),
      api<TopProduct[]>('/reports/top-products-profit?period=month&limit=10'),
      api<TopProduct[]>('/reports/least-sold-products?period=month&limit=10'),
      api<TopExpiringSoon[]>('/reports/top-products-expiring?limit=10'),
    ]).then(
      ([
        sToday,
        sMonth,
        marginTodayRes,
        marginMonthRes,
        byDayRes,
        purchasesByDayRes,
        expensesByDayRes,
        lowRes,
        expRes,
        cajaRes,
        topSoldRes,
        topProfitRes,
        leastRes,
        topExpRes,
      ]) => {
        setSalesToday(sToday.status === 'fulfilled' ? sToday.value : null);
        setSalesMonth(sMonth.status === 'fulfilled' ? sMonth.value : null);
        setMarginToday(marginTodayRes.status === 'fulfilled' ? marginTodayRes.value : null);
        setMarginMonth(marginMonthRes.status === 'fulfilled' ? marginMonthRes.value : null);
        setSalesByDay(byDayRes.status === 'fulfilled' && Array.isArray(byDayRes.value) ? byDayRes.value : []);
        setPurchasesByDay(purchasesByDayRes.status === 'fulfilled' && Array.isArray(purchasesByDayRes.value) ? purchasesByDayRes.value : []);
        setExpensesByDay(expensesByDayRes.status === 'fulfilled' && Array.isArray(expensesByDayRes.value) ? expensesByDayRes.value : []);
        setLowStockCount(lowRes.status === 'fulfilled' && Array.isArray(lowRes.value) ? lowRes.value.length : 0);
        setExpiringCount(expRes.status === 'fulfilled' && Array.isArray(expRes.value) ? expRes.value.length : 0);
        setOpenCaja(cajaRes.status === 'fulfilled' ? cajaRes.value : null);
        setTopSold(topSoldRes.status === 'fulfilled' && Array.isArray(topSoldRes.value) ? topSoldRes.value : []);
        setTopProfit(topProfitRes.status === 'fulfilled' && Array.isArray(topProfitRes.value) ? topProfitRes.value : []);
        setLeastSold(leastRes.status === 'fulfilled' && Array.isArray(leastRes.value) ? leastRes.value : []);
        setTopExpiringSoon(topExpRes.status === 'fulfilled' && Array.isArray(topExpRes.value) ? topExpRes.value : []);
      },
    ).finally(() => setLoading(false));
  }, []);

  const onLayoutChange = useCallback((_layout: unknown, allLayouts: { lg?: typeof defaultLayout }) => {
    const lg = allLayouts.lg;
    if (lg && Array.isArray(lg)) {
      setLayout(lg as typeof defaultLayout);
      saveLayout(lg as typeof defaultLayout);
    }
  }, []);

  if (loading) return <Loader full />;

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const currentMonth = monthNames[new Date().getMonth()];

  return (
    <Container>
      <PageHeader
        title="Dashboard"
        subtitle="Tu operación diaria, ventas e inventario en un solo lugar."
        className="mb-6"
        actions={<div className="hidden items-center gap-2 lg:flex">
          {isEditing && (
            <button
              type="button"
              onClick={() => { localStorage.removeItem(STORAGE_KEY); setLayout(defaultLayout); }}
              className="px-3 py-2 rounded-lg border border-hair-soft text-fg-muted text-sm font-medium hover:bg-raised"
            >
              Restablecer diseño
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsEditing((e) => !e)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${isEditing ? 'btn-brand border-transparent' : 'border-hair-soft text-fg-muted hover:bg-raised'}`}
          >
            {isEditing ? 'Listo (guardado)' : 'Editar dashboard'}
          </button>
        </div>}
      />

      {/* KPIs fijos */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <Link
          href="/pos"
          data-tour="dashboard-pos"
          className="rounded-xl border border-hair-soft bg-surface p-4 border-brand-card-hover transition-all"
        >
          <h3 className="text-brand font-semibold mb-1 text-sm">POS</h3>
          <p className="text-fg-muted text-xs">Ir al punto de venta</p>
        </Link>
        <div data-tour="dashboard-ventas-hoy" className="rounded-xl border border-hair-soft bg-surface p-4">
          <h3 className="text-fg-muted font-medium mb-1 text-sm">Ventas hoy</h3>
          <p className="text-lg font-bold text-fg">${salesToday?.total?.toFixed(0) ?? 0}</p>
          <p className="text-fg-faint text-xs">{salesToday?.count ?? 0} ventas</p>
        </div>
        <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-4">
          <h3 className="text-ok font-medium mb-1 text-sm">Ganancia hoy</h3>
          <p className="text-lg font-bold text-ok">${marginToday?.margin?.toFixed(0) ?? 0}</p>
          <p className="text-fg-faint text-xs">Ingresos − costo mercadería</p>
        </div>
        <div data-tour="dashboard-stock-bajo" className="rounded-xl border border-hair-soft bg-surface p-4">
          <h3 className="text-fg-muted font-medium mb-1 text-sm">Stock bajo</h3>
          <p className="text-lg font-bold text-fg">{lowStockCount}</p>
        </div>
        <Link
          href="/reportes"
          data-tour="dashboard-por-vencer"
          className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] p-4 hover:border-warn/30 transition-all block"
        >
          <h3 className="text-warn font-medium mb-1 text-sm">Por vencer</h3>
          <p className="text-lg font-bold text-fg">{expiringCount}</p>
          <p className="text-fg-faint text-xs">30 días</p>
        </Link>
        <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-4">
          <h3 className="text-ok font-medium mb-1 text-sm">Ganancia mes</h3>
          <p className="text-lg font-bold text-ok">${marginMonth?.margin?.toFixed(0) ?? 0}</p>
          <p className="text-fg-faint text-xs">Ingresos − costo mercadería</p>
        </div>
      </div>

      {/* Grid editable */}
      <div className="react-grid-layout-wrapper hidden max-w-full [&_.react-grid-item]:overflow-visible [&_.react-grid-item>div]:h-full [&_.react-grid-item>div]:min-h-0 lg:block">
        <ResponsiveGrid
          className="layout"
          layouts={{ lg: layout }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: 12 }}
          rowHeight={72}
          isDraggable={isEditing}
          isResizable={isEditing}
          isBounded
          compactType="vertical"
          preventCollision={false}
          onLayoutChange={onLayoutChange}
          draggableHandle=".drag-handle"
          margin={[16, 16]}
      >
        <div key="ventas" className="relative flex min-h-0 flex-col rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-fg font-semibold mb-2 shrink-0">Ventas por día · {currentMonth}</h3>
          <div className="flex-1 min-h-[160px] w-full">
            {salesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByDay} margin={chartDefaults.margin}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} />
                  <XAxis dataKey="day" tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} />
                  <YAxis tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={chartDefaults.tooltipStyle} labelStyle={chartDefaults.labelStyle} formatter={(value) => [`$${Number(value ?? 0).toFixed(0)}`, 'Ventas']} labelFormatter={(l) => `Día ${l}`} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {salesByDay.map((_, i) => <Cell key={i} fill="#0ea5e9" fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-fg-faint text-sm flex items-center h-full justify-center">Sin ventas este mes</p>
            )}
          </div>
        </div>

        <div key="compras" className="relative flex min-h-0 flex-col rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-fg font-semibold mb-2 shrink-0">Compras por día · {currentMonth}</h3>
          <div className="flex-1 min-h-[160px] w-full">
            {purchasesByDay.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purchasesByDay} margin={chartDefaults.margin}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} />
                  <XAxis dataKey="day" tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} />
                  <YAxis tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={chartDefaults.tooltipStyle} labelStyle={chartDefaults.labelStyle} formatter={(value) => [`$${Number(value ?? 0).toFixed(0)}`, 'Compras']} labelFormatter={(l) => `Día ${l}`} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {purchasesByDay.map((_, i) => <Cell key={i} fill="#8b5cf6" fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-fg-faint text-sm flex items-center h-full justify-center">Sin compras este mes</p>
            )}
          </div>
        </div>

        <div key="gastos" className="relative flex min-h-0 flex-col rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-fg font-semibold mb-2 shrink-0">Gastos por día · {currentMonth}</h3>
          <div className="flex-1 min-h-[160px] w-full">
            {expensesByDay.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expensesByDay} margin={chartDefaults.margin}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartDefaults.gridStroke} />
                  <XAxis dataKey="day" tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} />
                  <YAxis tick={chartDefaults.tickStyle} tickLine={chartDefaults.tickLine} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={chartDefaults.tooltipStyle} labelStyle={chartDefaults.labelStyle} formatter={(value) => [`$${Number(value ?? 0).toFixed(0)}`, 'Gastos']} labelFormatter={(l) => `Día ${l}`} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {expensesByDay.map((_, i) => <Cell key={i} fill="#f43f5e" fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-fg-faint text-sm flex items-center h-full justify-center">Sin gastos este mes</p>
            )}
          </div>
        </div>

        <div key="resumen" className="relative flex min-h-0 flex-col rounded-xl border border-hair-soft bg-surface p-5 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-fg font-semibold mb-3 shrink-0">Resumen del mes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0 flex-1">
            <div className="flex justify-between items-center gap-3 py-3 px-4 rounded-lg bg-raised2 text-base min-w-0">
              <span className="text-fg-muted">Ventas</span>
              <span className="font-bold text-fg text-lg shrink-0">${salesMonth?.total?.toFixed(0) ?? 0}</span>
            </div>
            <div className="flex justify-between items-center gap-3 py-3 px-4 rounded-lg bg-raised2 text-base min-w-0">
              <span className="text-fg-muted">Cant. ventas</span>
              <span className="font-bold text-fg text-lg shrink-0">{salesMonth?.count ?? 0}</span>
            </div>
            <div className="flex justify-between items-center gap-3 py-3 px-4 rounded-lg bg-[var(--ok-soft)] border border-ok/30 text-base min-w-0">
              <span className="text-ok">Ganancia</span>
              <span className="font-bold text-ok text-lg shrink-0">${marginMonth?.margin?.toFixed(0) ?? 0}</span>
            </div>
          </div>
        </div>

        <div key="top-vendidos" className="relative overflow-auto rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-brand font-semibold mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-dot" />Más vendidos</h3>
          <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
            {topSold.length === 0 ? <li className="text-fg-faint">Sin datos</li> : topSold.map((p, i) => (
              <li key={i} className="flex justify-between gap-2"><span className="text-fg-muted truncate" title={p.name}>{p.name}</span><span className="text-fg-muted whitespace-nowrap">{p.qty} un.</span></li>
            ))}
          </ul>
        </div>

        <div key="top-ganancia" className="relative overflow-auto rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-ok font-semibold mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--ok-soft)]" />Más ganancia</h3>
          <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
            {topProfit.length === 0 ? <li className="text-fg-faint">Sin datos</li> : topProfit.map((p, i) => (
              <li key={i} className="flex justify-between gap-2"><span className="text-fg-muted truncate" title={p.name}>{p.name}</span><span className="text-ok font-medium whitespace-nowrap">${p.profit?.toFixed(0) ?? 0}</span></li>
            ))}
          </ul>
        </div>

        <div key="top-menos" className="relative overflow-auto rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-warn font-semibold mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--warn-soft)]" />Menos vendidos</h3>
          <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
            {leastSold.length === 0 ? <li className="text-fg-faint">Sin datos</li> : leastSold.map((p, i) => (
              <li key={i} className="flex justify-between gap-2"><span className="text-fg-muted truncate" title={p.name}>{p.name}</span><span className="text-fg-muted whitespace-nowrap">{p.qty} un.</span></li>
            ))}
          </ul>
        </div>

        <div key="top-vencer" className="relative overflow-auto rounded-xl border border-hair-soft bg-surface p-4 shadow-lg">
          {isEditing && <div className="drag-handle absolute top-1.5 right-1.5 z-20 cursor-move rounded border border-hair bg-raised2 px-1.5 py-0.5 text-fg-faint text-[11px] leading-none" title="Arrastrar">⋮⋮</div>}
          <h3 className="text-crit font-semibold mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--crit-soft)]" />Próximos a vencer</h3>
          <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
            {topExpiringSoon.length === 0 ? <li className="text-fg-faint">Sin datos</li> : topExpiringSoon.map((p, i) => (
              <li key={i}>
                <div className="flex justify-between gap-2"><span className="text-fg-muted truncate" title={p.name}>{p.name}</span><span className="text-crit whitespace-nowrap">{p.qty} un.</span></div>
                <div className="text-fg-faint text-xs mt-0.5">Vence: {formatDate(p.nextExpiry)}</div>
              </li>
            ))}
          </ul>
        </div>
      </ResponsiveGrid>
      </div>

      <div className="space-y-3 lg:hidden">
        {[
          { title: `Ventas por día · ${currentMonth}`, data: salesByDay, label: 'Ventas', color: 'var(--brand-accent)', empty: 'Sin ventas este mes' },
          { title: `Compras por día · ${currentMonth}`, data: purchasesByDay, label: 'Compras', color: 'var(--warn)', empty: 'Sin compras este mes' },
          { title: `Gastos por día · ${currentMonth}`, data: expensesByDay, label: 'Gastos', color: 'var(--crit)', empty: 'Sin gastos este mes' },
        ].map((widget) => <section key={widget.label} className="rounded-xl border border-hair-soft bg-surface p-4"><h3 className="mb-3 font-semibold text-fg">{widget.title}</h3><div className="h-40 w-full">{widget.data.some((item) => item.total > 0) ? <ResponsiveContainer width="100%" height="100%"><BarChart data={widget.data} margin={chartDefaults.margin}><CartesianGrid strokeDasharray="3 3" stroke="var(--hair-soft)" /><XAxis dataKey="day" tick={chartDefaults.tickStyle} tickLine={false} /><YAxis tick={chartDefaults.tickStyle} tickLine={false} tickFormatter={(value) => `$${value}`} /><Tooltip contentStyle={chartDefaults.tooltipStyle} labelStyle={chartDefaults.labelStyle} formatter={(value) => [`$${Number(value ?? 0).toFixed(0)}`, widget.label]} labelFormatter={(label) => `Día ${label}`} /><Bar dataKey="total" fill={widget.color} radius={[4, 4, 0, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-fg-faint">{widget.empty}</p>}</div></section>)}
        <section className="rounded-xl border border-hair-soft bg-surface p-4"><h3 className="mb-3 font-semibold text-fg">Resumen del mes</h3><div className="space-y-2"><div className="flex justify-between rounded-lg bg-raised2 px-3 py-2"><span className="text-fg-muted">Ventas</span><span className="font-mono font-bold text-fg">${salesMonth?.total?.toFixed(0) ?? 0}</span></div><div className="flex justify-between rounded-lg bg-raised2 px-3 py-2"><span className="text-fg-muted">Cant. ventas</span><span className="font-mono font-bold text-fg">{salesMonth?.count ?? 0}</span></div><div className="flex justify-between rounded-lg border border-ok/30 bg-[var(--ok-soft)] px-3 py-2"><span className="text-ok">Ganancia</span><span className="font-mono font-bold text-ok">${marginMonth?.margin?.toFixed(0) ?? 0}</span></div></div></section>
        {[
          { title: 'Más vendidos', items: topSold, tone: 'text-brand', value: (item: TopProduct) => `${item.qty} un.` },
          { title: 'Más ganancia', items: topProfit, tone: 'text-ok', value: (item: TopProduct) => `$${item.profit?.toFixed(0) ?? 0}` },
          { title: 'Menos vendidos', items: leastSold, tone: 'text-warn', value: (item: TopProduct) => `${item.qty} un.` },
        ].map((widget) => <section key={widget.title} className="rounded-xl border border-hair-soft bg-surface p-4"><h3 className={`mb-3 font-semibold ${widget.tone}`}>{widget.title}</h3><ul className="space-y-2 text-sm">{widget.items.length === 0 ? <li className="text-fg-faint">Sin datos</li> : widget.items.map((item, index) => <li key={index} className="flex justify-between gap-3 border-b border-hair-soft pb-2 last:border-0 last:pb-0"><span className="min-w-0 truncate text-fg-muted">{item.name}</span><span className={`shrink-0 font-mono ${widget.tone}`}>{widget.value(item)}</span></li>)}</ul></section>)}
        <section className="rounded-xl border border-hair-soft bg-surface p-4"><h3 className="mb-3 font-semibold text-crit">Próximos a vencer</h3><ul className="space-y-2 text-sm">{topExpiringSoon.length === 0 ? <li className="text-fg-faint">Sin datos</li> : topExpiringSoon.map((item, index) => <li key={index} className="border-b border-hair-soft pb-2 last:border-0 last:pb-0"><div className="flex justify-between gap-3"><span className="min-w-0 truncate text-fg-muted">{item.name}</span><span className="shrink-0 font-mono text-crit">{item.qty} un.</span></div><p className="mt-0.5 font-mono text-xs text-fg-faint">Vence: {formatDate(item.nextExpiry)}</p></li>)}</ul></section>
      </div>

      {/* Caja y links */}
      <div className="mt-8 space-y-4">
        {openCaja ? (
          <div data-tour="dashboard-caja" className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-4">
            <p className="text-ok font-medium">Caja abierta</p>
            <Link href="/caja" className="text-brand hover:underline text-sm">Ver caja →</Link>
          </div>
        ) : (
          <div data-tour="dashboard-caja" className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] p-4">
            <p className="text-warn font-medium">Caja cerrada</p>
            <Link href="/caja" className="text-brand hover:underline text-sm">Abrir caja →</Link>
          </div>
        )}
        <div data-tour="dashboard-links" className="flex flex-wrap gap-2">
          <Link href="/reportes" className="px-4 py-2 rounded-lg border border-hair-soft text-fg-muted hover:bg-raised">Reportes</Link>
          <Link href="/productos" className="px-4 py-2 rounded-lg border border-hair-soft text-fg-muted hover:bg-raised">Productos</Link>
          <Link href="/compras" className="px-4 py-2 rounded-lg border border-hair-soft text-fg-muted hover:bg-raised">Compras</Link>
          <Link href="/clientes" className="px-4 py-2 rounded-lg border border-hair-soft text-fg-muted hover:bg-raised">Clientes</Link>
        </div>
      </div>
    </Container>
  );
}
