'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  buildFiguritasOrderWhatsApp,
  figuritasContactWhatsAppUrl,
  formatFiguritasMoney,
  getPublicFiguritasCatalogUrl,
  whatsappUrl,
} from '@/lib/figuritas';
import { getPublicAppUrl } from '@/lib/env-urls';
import { AlbumSpread } from '@/components/figuritas/AlbumSpread';
import { AdminHero } from '@/components/figuritas/AdminHero';
import { CountryFlag } from '@/components/figuritas/CountryFlag';
import {
  FigBtnPrimary,
  FigBtnSecondary,
  FigCard,
  FigEmpty,
  FigLoading,
  FigMessage,
  FigTabs,
} from '@/components/figuritas/FiguritasUI';
import { CountryPicker } from '@/components/figuritas/PublicHero';
import { fig } from '@/components/figuritas/theme';
import type { CountryRow } from '@/components/figuritas/types';

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
  priceUnit?: number | string | null;
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
  pending: 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30',
  confirmed: 'bg-red-500/20 text-red-200 border border-red-500/30',
  delivered: 'bg-red-400/20 text-red-100 border border-red-400/30',
  cancelled: 'bg-red-950/40 text-red-200/40 border border-red-900/30',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-red-950/40 text-red-200/60'}`}>
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
  const [globalPrice, setGlobalPrice] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stickers, setStickers] = useState<Record<string, Sticker[]>>({});
  const [stickerPrices, setStickerPrices] = useState<Record<string, string>>({});
  const [stickerPricesOrig, setStickerPricesOrig] = useState<Record<string, string | null>>({});

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

  const applyGlobalPrice = async () => {
    const price = Number(globalPrice);
    if (!isFinite(price) || price < 0) {
      setMsg('Ingresá un precio global válido.');
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await api('/stickers/prices/global', { method: 'POST', body: JSON.stringify({ price }) });
      setMsg(`Precio $${price} aplicado a todos los países. Overrides individuales limpiados.`);
      setGlobalPrice('');
      await loadCountries();
      if (expanded) await loadStickersForCountry(expanded);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const loadStickersForCountry = async (countryId: string) => {
    const data = await api<Sticker[]>(`/stickers/countries/${countryId}/stickers`);
    setStickers((prev) => ({ ...prev, [countryId]: data }));
    const sp: Record<string, string> = {};
    const orig: Record<string, string | null> = {};
    data.forEach((s) => {
      const override = s.priceUnit != null && s.priceUnit !== '' ? String(s.priceUnit) : '';
      sp[s.id] = override;
      orig[s.id] = override || null;
    });
    setStickerPrices((prev) => ({ ...prev, ...sp }));
    setStickerPricesOrig((prev) => ({ ...prev, ...orig }));
  };

  const savePrices = async () => {
    setBusy(true); setMsg(null);
    try {
      const countryChanges = countries
        .filter((c) => String(c.priceUnit) !== prices[c.id])
        .map((c) => ({ countryId: c.id, price: Number(prices[c.id]) }));

      const stickerChanges: { stickerId: string; price: number | null }[] = [];
      for (const [stickerId, val] of Object.entries(stickerPrices)) {
        const orig = stickerPricesOrig[stickerId] ?? null;
        const trimmed = val.trim();
        const countryId = expanded;
        const countryDefault = countryId ? prices[countryId] : '';
        const nextNorm = trimmed === '' || trimmed === countryDefault ? null : trimmed;
        const origNorm = orig === '' || orig === null ? null : orig;
        if (String(nextNorm) !== String(origNorm)) {
          stickerChanges.push({
            stickerId,
            price: nextNorm === null ? null : Number(nextNorm),
          });
        }
      }

      if (!countryChanges.length && !stickerChanges.length) {
        setMsg('Sin cambios de precio.');
        setBusy(false);
        return;
      }

      if (countryChanges.length) {
        await api('/stickers/countries/bulk-prices', {
          method: 'POST',
          body: JSON.stringify({ prices: countryChanges }),
        });
      }
      if (stickerChanges.length) {
        await api('/stickers/stickers/bulk-prices', {
          method: 'POST',
          body: JSON.stringify({ prices: stickerChanges }),
        });
      }

      setMsg(
        `Precios guardados: ${countryChanges.length} país(es), ${stickerChanges.length} figurita(s) individual(es).`,
      );
      await loadCountries();
      if (expanded) await loadStickersForCountry(expanded);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const toggleExpand = async (countryId: string) => {
    if (expanded === countryId) { setExpanded(null); return; }
    setExpanded(countryId);
    if (!stickers[countryId]) {
      try {
        await loadStickersForCountry(countryId);
      } catch (e) { setMsg((e as Error).message); }
    }
  };

  const applyCountryPriceToStickers = (countryId: string) => {
    const countryDefault = prices[countryId] ?? '';
    const list = stickers[countryId] ?? [];
    const next: Record<string, string> = {};
    list.forEach((s) => { next[s.id] = ''; });
    setStickerPrices((prev) => ({ ...prev, ...next }));
    setMsg(`Precio del país ($${countryDefault}) listo para aplicar a ${list.length} figuritas. Guardá cambios.`);
  };

  if (loading) return <FigLoading label="Cargando países…" />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <FigCard>
        <p className="text-[10px] uppercase tracking-wider text-red-200/50 font-semibold mb-2">
          Precio global — todas las figuritas
        </p>
        <p className="text-xs text-red-200/50 mb-3">
          Aplica el mismo precio a todos los países y limpia precios individuales por figurita.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="number"
            min={0}
            step={0.5}
            value={globalPrice}
            onChange={(e) => setGlobalPrice(e.target.value)}
            placeholder="Ej. 500"
            className={`${fig.input} sm:max-w-[160px]`}
          />
          <FigBtnPrimary onClick={applyGlobalPrice} disabled={busy || !globalPrice.trim()} className="sm:!py-2.5">
            Aplicar a todas
          </FigBtnPrimary>
        </div>
      </FigCard>

      <div className="flex flex-wrap gap-2 sm:gap-3">
        <FigBtnSecondary onClick={seedCountries} disabled={busy}>
          {busy ? 'Cargando…' : '🌍 Cargar 48 países'}
        </FigBtnSecondary>
        <FigBtnPrimary onClick={savePrices} disabled={busy}>
          Guardar precios
        </FigBtnPrimary>
      </div>

      {msg && <FigMessage>{msg}</FigMessage>}
      {countries.length === 0 && (
        <FigEmpty emoji="🌍" title="Sin países cargados" subtitle='Presioná "Cargar 48 países" para empezar.' />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {countries.map((c) => (
          <FigCard key={c.id} className="!p-0 overflow-hidden">
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CountryFlag country={c} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-red-50 leading-snug">{c.name}</p>
                  <p className="text-xs text-red-200/50 mt-0.5">
                    {c.code ? `${c.code} · ` : ''}{c._count.stickers} figuritas
                    {!c.isActive && <span className="ml-1 text-red-400">· inactivo</span>}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-red-200/50 mb-1">
                  Precio base del país
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={prices[c.id] ?? ''}
                  onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
                  className={fig.inputSm + ' w-full'}
                />
              </div>
              <button
                type="button"
                onClick={() => toggleExpand(c.id)}
                className={`w-full ${fig.btnGhost}`}
              >
                {expanded === c.id ? 'Ocultar precios individuales' : 'Precios por figurita'}
              </button>
            </div>
            {expanded === c.id && (
              <div className="border-t border-red-900/40 p-3 sm:p-4 bg-black/20 space-y-3">
                {(stickers[c.id] ?? []).length === 0 ? (
                  <p className="text-red-200/40 text-xs">Sin figuritas. Generá el álbum en Inventario.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-red-200/50">
                        Precio por figurita (vacío = precio del país)
                      </p>
                      <button
                        type="button"
                        onClick={() => applyCountryPriceToStickers(c.id)}
                        className="text-[10px] text-red-300 hover:text-red-100 underline"
                      >
                        Resetear todas al precio del país
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                      {(stickers[c.id] ?? []).map((s) => {
                        const isCustom = Boolean(stickerPrices[s.id]?.trim());
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${
                              isCustom
                                ? 'border-red-500/40 bg-red-600/10'
                                : 'border-red-900/30 bg-red-950/20'
                            }`}
                          >
                            <span className="text-xs font-mono font-bold text-red-100 w-8">#{s.number}</span>
                            <span className="text-[10px] text-red-200/40 shrink-0">×{s.stock}</span>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              placeholder={prices[c.id] ?? '0'}
                              value={stickerPrices[s.id] ?? ''}
                              onChange={(e) =>
                                setStickerPrices((p) => ({ ...p, [s.id]: e.target.value }))
                              }
                              className={`${fig.inputSm} flex-1 min-w-0`}
                              title={`Precio individual. Vacío usa $${prices[c.id] ?? 0} del país`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </FigCard>
        ))}
      </div>
    </div>
  );
}

function TabInventario() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selected, setSelected] = useState('');
  const [maxN, setMaxN] = useState('20');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [quickNumber, setQuickNumber] = useState('');
  const [quickQty, setQuickQty] = useState('1');

  useEffect(() => {
    api<Country[]>('/stickers/countries').then((data) => {
      setCountries(data);
      setSelected((prev) => prev || data[0]?.id || '');
    }).catch(() => {});
  }, []);

  const loadStickers = useCallback(async (countryId: string) => {
    if (!countryId) return;
    try {
      const data = await api<Sticker[]>(`/stickers/countries/${countryId}/stickers`);
      setStickers(data);
      const init: Record<string, number> = {};
      data.forEach((s) => { init[s.id] = s.stock; });
      setStocks(init);
    } catch (e) { setMsg((e as Error).message); }
  }, []);

  useEffect(() => {
    if (selected) loadStickers(selected);
  }, [selected, loadStickers]);

  const onSelectCountry = (id: string) => {
    setSelected(id);
    setMsg(null);
  };

  const countryMeta = countries.find((c) => c.id === selected);

  const albumCountry: CountryRow | null = useMemo(() => {
    if (!countryMeta) return null;
    const stickerRows = stickers.map((s) => ({
      id: s.id,
      number: s.number,
      stock: stocks[s.id] ?? s.stock,
    }));
    const availableCount = stickerRows.filter((s) => s.stock > 0).length;
    return {
      id: countryMeta.id,
      name: countryMeta.name,
      code: countryMeta.code,
      flag: countryMeta.flag,
      flagUrl: countryMeta.flagUrl,
      priceUnit: countryMeta.priceUnit,
      stickers: stickerRows,
      availableCount,
      totalUnits: stickerRows.reduce((a, s) => a + s.stock, 0),
    };
  }, [countryMeta, stickers, stocks]);

  const pickerCountries: CountryRow[] = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        flag: c.flag,
        flagUrl: c.flagUrl,
        priceUnit: c.priceUnit,
        stickers: [],
        availableCount: c._count?.stickers ?? 0,
      })),
    [countries],
  );

  const ensureStickers = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/stickers/countries/${selected}/stickers`, {
        method: 'POST',
        body: JSON.stringify({ maxNumber: Number(maxN) }),
      });
      setMsg(`Figuritas 1–${maxN} generadas en el álbum.`);
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const quickAdd = async (number?: number, delta?: number) => {
    const num = number ?? Number(quickNumber);
    const qty = delta ?? (Number(quickQty) || 1);
    if (!selected || num < 1) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/stickers/countries/${selected}/stickers/bulk`, {
        method: 'POST',
        body: JSON.stringify({ entries: [{ number: num, delta: qty }] }),
      });
      setMsg(`+#${num} ×${qty} agregadas al stock.`);
      if (!number) setQuickNumber('');
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const saveStocks = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const changed = stickers.filter((s) => s.stock !== stocks[s.id]);
      await Promise.all(
        changed.map((s) =>
          api(`/stickers/countries/${selected}/stickers/${s.number}`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: stocks[s.id] ?? 0 }),
          }),
        ),
      );
      setMsg(`${changed.length} figuritas guardadas en el álbum.`);
      await loadStickers(selected);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const onStockChange = (stickerId: string, stock: number) => {
    setStocks((p) => ({ ...p, [stickerId]: stock }));
  };

  const dirtyCount = stickers.filter((s) => s.stock !== stocks[s.id]).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <p className="text-sm text-red-200/60">
        Editá el stock como en un álbum Panini. Tocá cada casilla o usá + para sumar repetidas.
      </p>

      {countries.length > 0 && (
        <CountryPicker
          countries={pickerCountries}
          selectedId={selected}
          onSelect={onSelectCountry}
          variant="admin"
        />
      )}

      {selected && (
        <FigCard className="!p-3 sm:!p-4">
          <div className="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] uppercase tracking-wider text-red-200/50 mb-1.5">
                Generar casillas 1 a N
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={maxN}
                  onChange={(e) => setMaxN(e.target.value)}
                  className={`${fig.inputSm} w-20`}
                />
                <FigBtnSecondary onClick={ensureStickers} disabled={busy}>
                  Generar álbum
                </FigBtnSecondary>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] uppercase tracking-wider text-red-200/50 mb-1.5">
                Carga rápida
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  min={1}
                  value={quickNumber}
                  onChange={(e) => setQuickNumber(e.target.value)}
                  className={`${fig.inputSm} w-20`}
                  placeholder="#"
                />
                <input
                  type="number"
                  min={1}
                  value={quickQty}
                  onChange={(e) => setQuickQty(e.target.value)}
                  className={`${fig.inputSm} w-16`}
                />
                <FigBtnSecondary onClick={() => quickAdd()} disabled={busy || !quickNumber}>
                  Sumar
                </FigBtnSecondary>
              </div>
            </div>
            <FigBtnPrimary
              onClick={saveStocks}
              disabled={busy || !stickers.length || dirtyCount === 0}
              className="w-full lg:w-auto lg:ml-auto"
            >
              {dirtyCount > 0 ? `Guardar (${dirtyCount})` : 'Guardar cambios'}
            </FigBtnPrimary>
          </div>
        </FigCard>
      )}

      {msg && <FigMessage>{msg}</FigMessage>}

      {albumCountry && albumCountry.stickers.length > 0 && (
        <AlbumSpread
          mode="admin"
          country={albumCountry}
          stocks={stocks}
          onStockChange={onStockChange}
          onQuickAdd={(_stickerId, number) => quickAdd(number, 1)}
        />
      )}

      {selected && stickers.length === 0 && (
        <FigEmpty
          emoji="📔"
          title="Álbum vacío"
          subtitle="Este país no tiene casillas aún. Generá el álbum con el botón de arriba."
        />
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

  if (loading) return <FigLoading label="Cargando catálogo…" />;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-2xl">
      <p className="text-sm text-red-200/60">
        Compartí este link en Instagram o WhatsApp para que tus clientes armen pedidos desde el álbum.
        {appUrl ? ` Tu app: ${appUrl}` : ''}
      </p>

      {!process.env.NEXT_PUBLIC_APP_URL && (
        <FigMessage>
          Configurá <code className="font-mono text-red-100">NEXT_PUBLIC_APP_URL</code> en Vercel para que el link copiado sea siempre el de producción.
        </FigMessage>
      )}

      {msg && <FigMessage variant="error">{msg}</FigMessage>}

      {share ? (
        <div className="space-y-4">
          <FigCard>
            <p className="text-[10px] uppercase tracking-wider text-red-200/50 font-semibold mb-2">
              Link público del álbum
            </p>
            <p className="font-mono text-xs sm:text-sm text-red-50 break-all bg-black/30 rounded-xl p-3 border border-red-900/40">
              {publicUrl}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <FigBtnSecondary onClick={copyLink}>
                {copied ? '✓ Copiado!' : '📋 Copiar link'}
              </FigBtnSecondary>
              <a href={publicUrl} target="_blank" rel="noreferrer" className={fig.btnSecondary + ' inline-flex items-center'}>
                👁 Preview
              </a>
              <a
                href={figuritasContactWhatsAppUrl(`Mirá el catálogo de figuritas acá: ${publicUrl}`)}
                target="_blank"
                rel="noreferrer"
                className={fig.btnPrimary + ' inline-flex items-center !py-2'}
              >
                WhatsApp
              </a>
            </div>
          </FigCard>

          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${
                share.isActive
                  ? 'bg-red-600/30 text-red-100 border border-red-500/40'
                  : 'bg-red-950/50 text-red-200/40 border border-red-900/40'
              }`}
            >
              {share.isActive ? '● Catálogo activo' : '○ Catálogo inactivo'}
            </span>
            <FigBtnSecondary onClick={toggleActive} disabled={busy}>
              {share.isActive ? 'Desactivar' : 'Activar'}
            </FigBtnSecondary>
          </div>
        </div>
      ) : (
        <FigEmpty emoji="🔗" title="Sin catálogo compartido" subtitle="No se encontró información del link público." />
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

  if (loading) return <FigLoading label="Cargando pedidos…" />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <FigCard className="!py-3 sm:!py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm text-red-200/70 font-medium shrink-0">Filtrar por estado</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${fig.inputSm} sm:max-w-[200px]`}
          >
            <option value="all">Todos</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <span className="text-xs text-red-200/40 sm:ml-auto">
            {orders.length} pedido{orders.length !== 1 ? 's' : ''}
          </span>
        </div>
      </FigCard>

      {msg && <FigMessage variant="error">{msg}</FigMessage>}

      {orders.length === 0 && (
        <FigEmpty
          emoji="📦"
          title="Sin pedidos aún"
          subtitle="Cuando un cliente arme su pedido desde el link público, aparecerá acá."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {orders.map((order) => {
          const waText = buildFiguritasOrderWhatsApp({
            buyerName: order.buyerName,
            buyerPhone: order.buyerPhone,
            notes: order.notes,
            items: order.items,
            total: order.total,
          });
          return (
            <FigCard key={order.id} className="!p-0 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-3 border-b border-red-900/30 bg-red-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-red-50 truncate">
                      {order.buyerName ?? 'Sin nombre'}
                    </p>
                    {order.buyerPhone && (
                      <a
                        href={`tel:${order.buyerPhone.replace(/\s/g, '')}`}
                        className="text-sm text-red-200/70 hover:text-red-100"
                      >
                        {order.buyerPhone}
                      </a>
                    )}
                    <p className="text-[11px] text-red-200/40 mt-1">
                      {new Date(order.createdAt).toLocaleString('es-AR')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={order.status} />
                    <p className="text-lg font-black text-white">
                      {formatFiguritasMoney(order.total)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-red-200/50 font-semibold">
                  Figuritas ({order.items.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {order.items.map((item) => (
                    <span
                      key={item.id}
                      className="text-xs bg-red-950/50 border border-red-900/40 rounded-lg px-2 py-1 text-red-100"
                    >
                      {item.sticker.country.flag} {item.sticker.country.name}{' '}
                      <span className="font-mono text-red-300">#{item.sticker.number}</span>
                      {' '}×{item.qty}
                    </span>
                  ))}
                </div>
                {order.notes && (
                  <p className="text-xs text-red-200/50 italic border-l-2 border-red-800/50 pl-2">
                    {order.notes}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-2 border-t border-red-900/30">
                  <select
                    value={statusEdits[order.id] ?? order.status}
                    onChange={(e) => setStatusEdits((p) => ({ ...p, [order.id]: e.target.value }))}
                    className={fig.inputSm + ' flex-1 min-w-[140px]'}
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  <FigBtnSecondary
                    onClick={() => updateStatus(order.id)}
                    disabled={busyId === order.id}
                    className="sm:flex-1"
                  >
                    {busyId === order.id ? '…' : 'Actualizar estado'}
                  </FigBtnSecondary>
                  <a
                    href={whatsappUrl(waText)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm px-4 py-2 transition-colors sm:flex-1"
                  >
                    💬 WhatsApp
                  </a>
                </div>

                <div className="flex justify-end pt-1">
                  {confirmDelete === order.id ? (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <FigBtnPrimary
                        onClick={() => deleteOrder(order.id)}
                        disabled={busyId === order.id}
                        className="!py-2 flex-1 sm:flex-none !from-red-700 !to-red-800"
                      >
                        Confirmar eliminar
                      </FigBtnPrimary>
                      <FigBtnSecondary onClick={() => setConfirmDelete(null)} className="!py-2">
                        Cancelar
                      </FigBtnSecondary>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(order.id)}
                      className="text-xs text-red-200/40 hover:text-red-300 underline underline-offset-2"
                    >
                      Eliminar pedido
                    </button>
                  )}
                </div>
              </div>
            </FigCard>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'paises', label: 'Países y precios', icon: '🌍' },
  { key: 'inventario', label: 'Inventario', icon: '📔' },
  { key: 'catalogo', label: 'Catálogo público', icon: '🔗' },
  { key: 'pedidos', label: 'Pedidos', icon: '📦' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function FigurityasPage() {
  const [tab, setTab] = useState<TabKey>('paises');

  return (
    <div className="relative min-h-screen">
      <div className={fig.pageGlow} />
      <div className="relative p-4 md:p-6 space-y-4 sm:space-y-5 max-w-6xl mx-auto">
        <AdminHero />
        <FigTabs tabs={[...TABS]} active={tab} onChange={setTab} />
        <div className="pt-1">
          {tab === 'paises' && <TabPaisesPrecios />}
          {tab === 'inventario' && <TabInventario />}
          {tab === 'catalogo' && <TabCatalogo />}
          {tab === 'pedidos' && <TabPedidos />}
        </div>
      </div>
    </div>
  );
}
