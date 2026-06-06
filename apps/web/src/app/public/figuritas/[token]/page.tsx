'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import {
  buildFiguritasOrderWhatsApp,
  formatFiguritasMoney,
  whatsappUrl,
} from '@/lib/figuritas';

type CatalogSticker = { id: string; number: number; stock: number };
type CatalogCountry = {
  id: string;
  name: string;
  code?: string | null;
  flag?: string | null;
  flagUrl?: string | null;
  priceUnit: number | string;
  stickers: CatalogSticker[];
};

type Catalog = {
  business: { name: string };
  countries: CatalogCountry[];
};

type CartLine = {
  stickerId: string;
  countryId: string;
  countryName: string;
  flag?: string | null;
  flagUrl?: string | null;
  number: number;
  priceUnit: number;
  qty: number;
  maxStock: number;
};

function unitPrice(c: CatalogCountry) {
  return Number(c.priceUnit) || 0;
}

function CountryVisual({ country, size = 'md' }: { country: { flag?: string | null; flagUrl?: string | null; name: string }; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  if (country.flagUrl?.trim()) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={country.flagUrl} alt="" className={`${cls} rounded object-cover inline-block`} />;
  }
  return <span className={size === 'sm' ? 'text-base' : 'text-lg'}>{country.flag ?? '🏳️'}</span>;
}

export default function PublicFiguritasPage() {
  const params = useParams();
  const token = String(params.token ?? '');

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{
    orderId: string;
    total: number;
    items: CartLine[];
    buyerName: string;
    buyerPhone: string;
    notes: string;
  } | null>(null);
  const [showCart, setShowCart] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicApi<Catalog>(`/public/stickers/${token}`);
      setCatalog(data);
    } catch (e) {
      setError((e as Error).message || 'Catálogo no disponible');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const cartTotal = useMemo(
    () => cart.reduce((acc, l) => acc + l.priceUnit * l.qty, 0),
    [cart],
  );

  const cartCount = useMemo(() => cart.reduce((acc, l) => acc + l.qty, 0), [cart]);

  const addToCart = (country: CatalogCountry, sticker: CatalogSticker) => {
    if (sticker.stock < 1) return;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.stickerId === sticker.id);
      if (idx >= 0) {
        const next = [...prev];
        const line = next[idx];
        if (line.qty >= line.maxStock) return prev;
        next[idx] = { ...line, qty: line.qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          stickerId: sticker.id,
          countryId: country.id,
          countryName: country.name,
          flag: country.flag,
          flagUrl: country.flagUrl,
          number: sticker.number,
          priceUnit: unitPrice(country),
          qty: 1,
          maxStock: sticker.stock,
        },
      ];
    });
    setShowCart(true);
  };

  const setQty = (stickerId: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.stickerId === stickerId
            ? { ...l, qty: Math.min(Math.max(0, qty), l.maxStock) }
            : l,
        )
        .filter((l) => l.qty > 0),
    );
  };

  const submitOrder = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await publicApi<{ id: string; total: number | string }>(
        `/public/stickers/${token}/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            buyerName: buyerName.trim() || undefined,
            buyerPhone: buyerPhone.trim() || undefined,
            notes: notes.trim() || undefined,
            items: cart.map((l) => ({ stickerId: l.stickerId, qty: l.qty })),
          }),
        },
      );
      setDone({
        orderId: order.id,
        total: Number(order.total) || cartTotal,
        items: [...cart],
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        notes: notes.trim(),
      });
      setCart([]);
      setShowCart(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCountries = useMemo(() => {
    if (!catalog) return [];
    if (countryFilter === 'all') return catalog.countries;
    return catalog.countries.filter((c) => c.id === countryFilter);
  }, [catalog, countryFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <p className="text-slate-400">Cargando catálogo…</p>
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-xl font-semibold">Catálogo no disponible</p>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    const waText = buildFiguritasOrderWhatsApp({
      buyerName: done.buyerName,
      buyerPhone: done.buyerPhone,
      notes: done.notes ? `${done.notes} (ref ${done.orderId.slice(-8)})` : `Ref ${done.orderId.slice(-8)}`,
      items: done.items.map((l) => ({
        qty: l.qty,
        sticker: {
          number: l.number,
          country: { name: l.countryName, flag: l.flag },
        },
      })),
      total: done.total,
    });
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 text-center">
          <div className="text-4xl">✅</div>
          <h1 className="text-xl font-bold">¡Pedido enviado!</h1>
          <p className="text-slate-400 text-sm">
            {catalog?.business.name} recibió tu pedido. Total: {formatFiguritasMoney(done.total)}
          </p>
          <a
            href={whatsappUrl(waText)}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium"
          >
            Avisar por WhatsApp
          </a>
          <button
            type="button"
            onClick={() => { setDone(null); load(); }}
            className="text-sm text-sky-400 hover:underline"
          >
            Seguir viendo figuritas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4">
        <h1 className="text-lg font-bold truncate">{catalog?.business.name ?? 'Figuritas'}</h1>
        <p className="text-xs text-slate-400">Mundial 2026 — elegí tus figuritas</p>
      </header>

      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            type="button"
            onClick={() => setCountryFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              countryFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Todos
          </button>
          {catalog?.countries.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCountryFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex items-center gap-1.5 ${
                countryFilter === c.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              <CountryVisual country={c} size="sm" />
              {c.code ?? c.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="px-4 space-y-6">
        {filteredCountries.length === 0 && (
          <p className="text-slate-400 text-sm py-8 text-center">No hay figuritas disponibles por ahora.</p>
        )}
        {filteredCountries.map((country) => (
          <section key={country.id}>
            <div className="flex items-center gap-2 mb-3">
              <CountryVisual country={country} />
              <h2 className="font-semibold">{country.name}</h2>
              <span className="text-xs text-slate-400 ml-auto">
                {formatFiguritasMoney(unitPrice(country))} c/u
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {country.stickers.map((s) => {
                const inCart = cart.find((l) => l.stickerId === s.id)?.qty ?? 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addToCart(country, s)}
                    disabled={s.stock <= inCart}
                    className={`relative rounded-xl border p-2 text-center transition ${
                      s.stock <= inCart
                        ? 'border-slate-800 bg-slate-900 opacity-50 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-800 hover:border-sky-500 active:scale-95'
                    }`}
                  >
                    <div className="font-mono text-sm font-bold">#{s.number}</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">×{s.stock}</div>
                    {inCart > 0 && (
                      <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {inCart}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Barra carrito */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-slate-900 border-t border-slate-700 safe-area-pb">
        <button
          type="button"
          onClick={() => setShowCart((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="font-medium">
            Carrito {cartCount > 0 ? `(${cartCount})` : ''}
          </span>
          <span className="text-sky-400 font-semibold">{formatFiguritasMoney(cartTotal)}</span>
        </button>

        {showCart && (
          <div className="max-h-[60vh] overflow-y-auto border-t border-slate-800 px-4 py-3 space-y-3">
            {cart.length === 0 ? (
              <p className="text-slate-400 text-sm">Tocá una figurita para agregarla.</p>
            ) : (
              <>
                {cart.map((line) => (
                  <div key={line.stickerId} className="flex items-center gap-2 text-sm">
                    <CountryVisual country={{ name: line.countryName, flag: line.flag, flagUrl: line.flagUrl }} size="sm" />
                    <span className="flex-1 truncate">
                      {line.countryName} #{line.number}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(line.stickerId, line.qty - 1)}
                        className="w-7 h-7 rounded bg-slate-700"
                      >
                        −
                      </button>
                      <span className="w-6 text-center">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.stickerId, line.qty + 1)}
                        disabled={line.qty >= line.maxStock}
                        className="w-7 h-7 rounded bg-slate-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-16 text-right text-slate-400">
                      {formatFiguritasMoney(line.priceUnit * line.qty)}
                    </span>
                  </div>
                ))}

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="tel"
                    placeholder="WhatsApp / teléfono"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Notas (opcional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={submitOrder}
                  disabled={submitting || !cart.length}
                  className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 font-semibold"
                >
                  {submitting ? 'Enviando…' : 'Confirmar pedido'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
