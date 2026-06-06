'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  buildFiguritasOrderWhatsApp,
  formatFiguritasMoney,
  getPublicFiguritasCatalogUrl,
  whatsappUrl,
} from '@/lib/figuritas';
import { getPublicAppUrl } from '@/lib/env-urls';

// ─── Types ────────────────────────────────────────────────────────────────────

type Country = {
  id: string;
  name: string;
  code?: string | null;
  flag?: string | null;
  flagUrl?: string | null;
  priceUnit: number;
  isActive: boolean;
  _count: { stickers: number };
};

type Sticker = {
  id: string;
  number: number;
  stock: number;
};

type ShareInfo = {
  id: string;
  token: string;
  isActive: boolean;
};

type OrderItem = {
  id: string;
  qty: number;
  sticker: { number: number; country: { name: string; flag: string } };
};

type Order = {
  id: string;
  buyerName: string | null;
  buyerPhone: string | null;
  notes: string | null;
  status: string;
  total: number | string;
  createdAt: string;
  items: OrderItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  confirmed: 'bg-blue-500/20 text-blue-300',
  delivered: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-slate-500/20 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-slate-700 text-slate-300'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Tab components ────────────────────────────────────────────────────────────

function TabPaisesPrecios() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Record<string, Sticker[]>>({});

  const loadCountries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Country[]>('/stickers/countries', { params: { includeInactive: 'true' } });
      setCountries(data);
      const initial: Record<string, string> = {};
      data.forEach((c) => { initial[c.id] = String(c.priceUnit); });
      setPrices(initial);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCountries(); }, [loadCountries]);

  const seedCountries = async () => {
    setBusy(true); setMsg(null);
    try {
      await api('/stickers/seed-countries', { method: 'POST' });
      setMsg('48 países cargados correctamente.');
      await loadCountries();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const savePrices = async () => {
    setBusy(true); setMsg(null);
    try {
      const changed = countries
        .filter((c) => String(c.priceUnit) !== prices[c.id])
        .map((c) => ({ countryId: c.id, price: Number(prices[c.id]) }));
      if (!changed.length) { setMsg('Sin cambios de precio.'); setBusy(false); return; }
      await api('/stickers/countries/bulk-prices', { method: 'POST', body: JSON.stringify({ prices: changed }) });
      setMsg(`Precios actualizados (${changed.length} países).`);
      await loadCountries();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const toggleExpand = async (countryId: string) => {
    if (expanded === countryId) { setExpanded(null); return; }
    setExpanded(countryId);
    if (!stickers[countryId]) {
      try {
        const data = await api<Sticker[]>(`/stickers/countries/${countryId}/stickers`);
        setStickers((prev) => ({ ...prev, [countryId]: data }));
      } catch (e) { setMsg((e as Error).message); }
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando países…</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <button onClick={seedCountries} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium disabled:opacity-50">
          {busy ? 'Cargando…' : 'Cargar 48 países'}
        </button>
        <button onClick={savePrices} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
          Guardar precios
        </button>
      </div>
      {msg && <div className="rounded-lg bg-blue-900/40 border border-blue-700 text-blue-300 text-sm px-4 py-2">{msg}</div>}
      {countries.length === 0 && <p className="text-slate-400 text-sm">Sin países. Presioná "Cargar 48 países".</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-left">
            <tr>
              <th className="px-3 py-2">País</th>
              <th className="px-3 py-2 w-36">Precio/figurita</th>
              <th className="px-3 py-2 text-right">Figuritas</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <Fragment key={c.id}>
                <tr className="border-t border-slate-800 hover:bg-slate-800/50">
                  <td className="px-3 py-2 font-medium">
                    {c.flag ?? ''} {c.name}
                    {c.code ? <span className="text-slate-500 text-xs ml-1">({c.code})</span> : null}
                    {!c.isActive && <span className="ml-2 text-xs text-red-400">inactivo</span>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={prices[c.id] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
                      className="w-28 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">{c._count.stickers}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleExpand(c.id)}
                      className="text-xs px-3 py-1 rounded border border-slate-700 hover:bg-slate-700"
                    >
                      {expanded === c.id ? 'Ocultar' : 'Ver figuritas'}
                    </button>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr key={`${c.id}-stickers`} className="border-t border-slate-800">
                    <td colSpan={4} className="px-3 py-3 bg-slate-900">
                      <div className="flex flex-wrap gap-2">
                        {(stickers[c.id] ?? []).map((s) => (
                          <span
                            key={s.id}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono ${s.stock > 0 ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}
                          >
                            #{s.number} ×{s.stock}
                          </span>
                        ))}
                        {(stickers[c.id] ?? []).length === 0 && (
                          <span className="text-slate-500 text-xs">Sin figuritas generadas.</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabInventario() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selected, setSelected] = useState('');
  const [maxN, setMaxN] = useState('20');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [quickNumber, setQuickNumber] = useState('');
  const [quickQty, setQuickQty] = useState('1');

  useEffect(() => {
    api<Country[]>('/stickers/countries').then(setCountries).catch(() => {});
  }, []);

  const loadStickers = useCallback(async (countryId: string) => {
    if (!countryId) return;
    try {
      const data = await api<Sticker[]>(`/stickers/countries/${countryId}/stickers`);
      setStickers(data);
      const init: Record<string, string> = {};
      data.forEach((s) => { init[s.id] = String(s.stock); });
      setStocks(init);
    } catch (e) { setMsg((e as Error).message); }
  }, []);

  const onSelectCountry = (id: string) => {
    setSelected(id);
    setMsg(null);
    loadStickers(id);
  };

  const ensureStickers = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/stickers/countries/${selected}/stickers`, {
        method: 'POST',
        body: JSON.stringify({ maxNumber: Number(maxN) }),
      });
      setMsg(`Figuritas 1–${maxN} generadas.`);
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const quickAdd = async () => {
    if (!selected || !quickNumber) return;
    const number = Number(quickNumber);
    const delta = Number(quickQty) || 1;
    if (number < 1) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/stickers/countries/${selected}/stickers/bulk`, {
        method: 'POST',
        body: JSON.stringify({ entries: [{ number, delta }] }),
      });
      setMsg(`+#${number} ×${delta} agregadas al stock.`);
      setQuickNumber('');
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const saveStocks = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const changed = stickers.filter((s) => String(s.stock) !== stocks[s.id]);
      await Promise.all(
        changed.map((s) =>
          api(`/stickers/countries/${selected}/stickers/${s.number}`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: Number(stocks[s.id]) }),
          })
        )
      );
      setMsg(`${changed.length} figuritas actualizadas.`);
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">País</label>
          <select
            value={selected}
            onChange={(e) => onSelectCountry(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[200px]"
          >
            <option value="">— Seleccioná un país —</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.flag} {c.name}</option>
            ))}
          </select>
        </div>
        {selected && (
          <>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Generar 1 a N</label>
              <div className="flex gap-2">
                <input
                  type="number" min={1} value={maxN}
                  onChange={(e) => setMaxN(e.target.value)}
                  className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
                <button onClick={ensureStickers} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm disabled:opacity-50">
                  Generar
                </button>
              </div>
            </div>
            <button onClick={saveStocks} disabled={busy || !stickers.length} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
              Guardar cambios
            </button>
          </>
        )}
      </div>
      {selected && (
        <div className="flex flex-wrap gap-2 items-end p-3 rounded-lg bg-slate-800/60 border border-slate-700">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Carga rápida — Nº figurita</label>
            <input
              type="number" min={1} value={quickNumber}
              onChange={(e) => setQuickNumber(e.target.value)}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="#"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cantidad</label>
            <input
              type="number" min={1} value={quickQty}
              onChange={(e) => setQuickQty(e.target.value)}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={quickAdd}
            disabled={busy || !quickNumber}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm disabled:opacity-50"
          >
            Sumar repetidas
          </button>
        </div>
      )}
      {msg && <div className="rounded-lg bg-blue-900/40 border border-blue-700 text-blue-300 text-sm px-4 py-2">{msg}</div>}
      {stickers.length > 0 && (
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
          {stickers.map((s) => (
            <div key={s.id} className="bg-slate-800 rounded-lg p-2 text-center">
              <div className="text-xs text-slate-400 font-mono mb-1">#{s.number}</div>
              <input
                type="number" min={0}
                value={stocks[s.id] ?? '0'}
                onChange={(e) => setStocks((p) => ({ ...p, [s.id]: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-center text-slate-200"
              />
            </div>
          ))}
        </div>
      )}
      {selected && stickers.length === 0 && (
        <p className="text-slate-400 text-sm">Sin figuritas. Generá con el botón de arriba.</p>
      )}
    </div>
  );
}

function TabCatalogo() {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    setAppUrl(getPublicAppUrl());
    api<ShareInfo>('/stickers/share')
      .then(setShare)
      .catch((e) => setMsg((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const publicUrl = share ? getPublicFiguritasCatalogUrl(share.token) : '';

  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleActive = async () => {
    if (!share) return;
    setBusy(true);
    try {
      const updated = await api<ShareInfo>('/stickers/share', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !share.isActive }),
      });
      setShare(updated);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const waShare = encodeURIComponent(`Mirá el catálogo de figuritas acá: ${publicUrl}`);

  if (loading) return <div className="p-4 text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-slate-400 text-sm">
        Compartí este link en Instagram o WhatsApp. Apunta a tu app en Vercel
        {appUrl ? `: ${appUrl}` : ''}.
      </p>
      {!process.env.NEXT_PUBLIC_APP_URL && (
        <p className="text-amber-400/90 text-xs rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2">
          Configurá <code className="font-mono">NEXT_PUBLIC_APP_URL</code> en Vercel (ej. https://tu-app.vercel.app) para que el link copiado sea siempre el de producción.
        </p>
      )}
      {msg && <div className="rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2">{msg}</div>}
      {share ? (
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-lg p-4 space-y-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Link público (deploy)</p>
            <p className="font-mono text-sm text-slate-200 break-all">{publicUrl}</p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={copyLink} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium">
                {copied ? '✓ Copiado!' : 'Copiar link'}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-sm font-medium"
              >
                Abrir preview
              </a>
              <a
                href={`https://wa.me/5491136012858?text=${waShare}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium"
              >
                Compartir por WhatsApp
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex px-3 py-1.5 rounded text-xs font-medium ${share.isActive ? 'bg-green-900/40 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
              {share.isActive ? 'Catálogo activo' : 'Catálogo inactivo'}
            </span>
            <button
              type="button"
              onClick={toggleActive}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-700 disabled:opacity-50"
            >
              {share.isActive ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm">No se encontró información del catálogo compartido.</p>
      )}
    </div>
  );
}

function TabPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusEdits, setStatusEdits] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Order[]>('/stickers/orders', {
        params: statusFilter !== 'all' ? { status: statusFilter } : {},
      });
      setOrders(data);
      const init: Record<string, string> = {};
      data.forEach((o) => { init[o.id] = o.status; });
      setStatusEdits(init);
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const updateStatus = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await api(`/stickers/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusEdits[orderId] }),
      });
      await loadOrders();
    } catch (e) { setMsg((e as Error).message); } finally { setBusyId(null); }
  };

  const deleteOrder = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await api(`/stickers/orders/${orderId}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await loadOrders();
    } catch (e) { setMsg((e as Error).message); } finally { setBusyId(null); }
  };

  if (loading) return <div className="p-4 text-slate-400">Cargando pedidos…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm text-slate-400">Filtrar:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="all">Todos</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>
      {msg && <div className="rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-2">{msg}</div>}
      {orders.length === 0 && <p className="text-slate-400 text-sm">Sin pedidos aún.</p>}
      <div className="space-y-3">
        {orders.map((order) => {
          const waText = buildFiguritasOrderWhatsApp({
            buyerName: order.buyerName,
            buyerPhone: order.buyerPhone,
            notes: order.notes,
            items: order.items,
            total: order.total,
          });
          return (
            <div key={order.id} className="bg-slate-800 rounded-lg p-4 space-y-3 border border-slate-700">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium text-slate-200">{order.buyerName ?? 'Sin nombre'}</p>
                  {order.buyerPhone && <p className="text-sm text-slate-400">{order.buyerPhone}</p>}
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(order.createdAt).toLocaleString('es-AR')}</p>
                  <p className="text-sm text-emerald-400 mt-1">{formatFiguritasMoney(order.total)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} />
                  <span className="text-xs text-slate-400">{order.items.length} items</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {order.items.map((item) => (
                  <span key={item.id} className="text-xs bg-slate-700 rounded px-2 py-1 text-slate-300">
                    {item.sticker.country.flag} #{item.sticker.number} ×{item.qty}
                  </span>
                ))}
              </div>
              {order.notes && <p className="text-xs text-slate-400 italic">"{order.notes}"</p>}
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-700">
                <select
                  value={statusEdits[order.id] ?? order.status}
                  onChange={(e) => setStatusEdits((p) => ({ ...p, [order.id]: e.target.value }))}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
                >
                  {Object.entries(STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => updateStatus(order.id)}
                  disabled={busyId === order.id}
                  className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm disabled:opacity-50"
                >
                  {busyId === order.id ? '…' : 'Actualizar'}
                </button>
                <a
                  href={whatsappUrl(waText)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs"
                >
                  WhatsApp
                </a>
                {confirmDelete === order.id ? (
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => deleteOrder(order.id)} disabled={busyId === order.id} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs disabled:opacity-50">
                      Confirmar
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-xs">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(order.id)} className="ml-auto text-xs text-slate-500 hover:text-red-400">
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'paises', label: 'Países y precios' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'catalogo', label: 'Catálogo público' },
  { key: 'pedidos', label: 'Pedidos' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function FigurityasPage() {
  const [tab, setTab] = useState<TabKey>('paises');

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Figuritas Mundial</h1>
        <p className="text-sm text-slate-400 mt-1">Gestioná países, inventario, catálogo y pedidos.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'paises' && <TabPaisesPrecios />}
        {tab === 'inventario' && <TabInventario />}
        {tab === 'catalogo' && <TabCatalogo />}
        {tab === 'pedidos' && <TabPedidos />}
      </div>
    </div>
  );
}
