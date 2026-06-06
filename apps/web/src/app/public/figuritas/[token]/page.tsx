'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { AlbumSpread } from '@/components/figuritas/AlbumSpread';
import { CountryPicker } from '@/components/figuritas/PublicHero';
import { PublicHero } from '@/components/figuritas/PublicHero';
import { PublicCart } from '@/components/figuritas/PublicCart';
import { PublicContactActions } from '@/components/figuritas/PublicContactActions';
import type { CartLine, CatalogResponse, CountryRow } from '@/components/figuritas/types';
import { stickerEffectivePrice } from '@/components/figuritas/types';
import { fig } from '@/components/figuritas/theme';
import {
  buildFiguritasOrderWhatsApp,
  formatFiguritasMoney,
  whatsappUrl,
} from '@/lib/figuritas';

function unitPrice(c: CountryRow) {
  return Number(c.priceUnit) || 0;
}

export default function PublicFiguritasPage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const albumRef = useRef<HTMLDivElement>(null);

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [done, setDone] = useState<{
    orderId: string;
    total: number;
    items: CartLine[];
    buyerName: string;
    buyerPhone: string;
    notes: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicApi<CatalogResponse>(`/public/stickers/${token}`);
      setCatalog(data);
      const firstWithStock = data.countries.find((c) => (c.availableCount ?? 0) > 0);
      setSelectedCountryId(firstWithStock?.id ?? data.countries[0]?.id ?? '');
    } catch (e) {
      setError((e as Error).message || 'Catálogo no disponible');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const cartQty = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((l) => { map[l.stickerId] = l.qty; });
    return map;
  }, [cart]);

  const cartTotal = useMemo(
    () => cart.reduce((acc, l) => acc + l.priceUnit * l.qty, 0),
    [cart],
  );

  const selectedCountry = useMemo(
    () => catalog?.countries.find((c) => c.id === selectedCountryId) ?? null,
    [catalog, selectedCountryId],
  );

  const addToCart = (country: CountryRow, stickerId: string) => {
    const sticker = country.stickers.find((s) => s.id === stickerId);
    if (!sticker || sticker.stock < 1) return;

    setCart((prev) => {
      const idx = prev.findIndex((l) => l.stickerId === stickerId);
      if (idx >= 0) {
        const line = prev[idx];
        if (line.qty >= line.maxStock) return prev;
        const next = [...prev];
        next[idx] = { ...line, qty: line.qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          stickerId,
          countryId: country.id,
          countryName: country.name,
          flag: country.flag,
          flagUrl: country.flagUrl,
          number: sticker.number,
          priceUnit: stickerEffectivePrice(sticker, unitPrice(country)),
          qty: 1,
          maxStock: sticker.stock,
        },
      ];
    });
    setCartExpanded(true);
  };

  const removeFromCart = (stickerId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.stickerId === stickerId);
      if (idx < 0) return prev;
      const line = prev[idx];
      if (line.qty <= 1) return prev.filter((l) => l.stickerId !== stickerId);
      const next = [...prev];
      next[idx] = { ...line, qty: line.qty - 1 };
      return next;
    });
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
    if (!cart.length || !buyerName.trim() || !buyerPhone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await publicApi<{ id: string; total: number | string }>(
        `/public/stickers/${token}/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            buyerName: buyerName.trim(),
            buyerPhone: buyerPhone.trim(),
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
      setCartExpanded(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToAlbum = () => {
    albumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className={`${fig.pageBg} flex flex-col items-center justify-center p-6 gap-4`}>
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-red-500/30 border-t-red-400 animate-spin" />
        <p className="text-red-200/50 text-sm">Abriendo el álbum de figuritas…</p>
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className={`${fig.pageBg} flex items-center justify-center p-4 sm:p-6`}>
        <div className="max-w-md text-center space-y-4">
          <span className="text-5xl">📭</span>
          <h1 className="text-xl font-bold text-white">Catálogo no disponible</h1>
          <p className="text-red-200/60 text-sm">{error}</p>
          <p className="text-red-200/40 text-xs">
            El link puede haber expirado o el local desactivó el catálogo. Pedile un link nuevo al kiosco.
          </p>
        </div>
      </div>
    );
  }

  if (done && catalog) {
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
      <div className={`${fig.pageBg} flex items-center justify-center p-4 sm:p-6`}>
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/60 to-[#0c0606] p-6 sm:p-8 space-y-5 text-center shadow-2xl">
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl sm:text-2xl font-black text-white">¡Pedido enviado!</h1>
          <p className="text-red-100/80 text-sm leading-relaxed">
            <strong className="text-white">{catalog.business.name}</strong> ya recibió tu pedido de figuritas.
            Total: <strong className="text-red-200">{formatFiguritasMoney(done.total)}</strong>
          </p>
          <p className="text-red-200/50 text-xs">
            Te van a contactar por WhatsApp para confirmar pago y retiro en el local.
          </p>
          <a
            href={whatsappUrl(waText)}
            target="_blank"
            rel="noreferrer"
            className={`block w-full ${fig.btnPrimary}`}
          >
            Avisar por WhatsApp
          </a>
          <button
            type="button"
            onClick={() => { setDone(null); load(); }}
            className="text-sm text-red-300/90 hover:text-red-200 underline underline-offset-2"
          >
            Seguir viendo el álbum
          </button>
        </div>
      </div>
    );
  }

  const stats = catalog?.stats ?? { countries: 0, availableUnits: 0, availableSlots: 0 };

  return (
    <div className={`${fig.pageBg} pb-36 sm:pb-40`}>
      <div className={fig.pageGlow} />

      <div className="relative max-w-3xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-5 sm:space-y-6">
        {catalog && (
          <PublicHero
            businessName={catalog.business.name}
            businessAddress={catalog.business.address}
            stats={stats}
            onStart={scrollToAlbum}
          />
        )}

        {error && <div className={fig.msgError}>{error}</div>}

        {!catalog?.countries.length ? (
          <div className="text-center py-16 space-y-2">
            <span className="text-4xl">📔</span>
            <p className="text-red-200/50">Todavía no hay figuritas cargadas en este catálogo.</p>
          </div>
        ) : (
          <div ref={albumRef} className="space-y-4 scroll-mt-4">
            <CountryPicker
              countries={catalog!.countries}
              selectedId={selectedCountryId}
              onSelect={setSelectedCountryId}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <p className="text-xs text-red-200/40">
                Leyenda: <span className="text-red-400">rojo</span> = disponible · gris = agotada
              </p>
              <label className="flex items-center gap-2 text-xs text-red-200/50 cursor-pointer self-end sm:self-auto">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                  className="rounded border-red-800 bg-red-950 text-red-500 focus:ring-red-500/50"
                />
                Solo disponibles
              </label>
            </div>

            {selectedCountry && (
              <AlbumSpread
                mode="public"
                country={selectedCountry}
                onlyAvailable={onlyAvailable}
                cartQty={cartQty}
                onAdd={(id) => addToCart(selectedCountry, id)}
                onRemove={removeFromCart}
              />
            )}
          </div>
        )}

        <footer className="text-center space-y-4 pb-4">
          {catalog && (
            <PublicContactActions
              businessName={catalog.business.name}
              address={catalog.business.address}
              compact
            />
          )}
          <p className="text-[10px] text-red-200/30">
            Álbum de figuritas · Mundial 2026 · {catalog?.business.name}
          </p>
        </footer>
      </div>

      <PublicCart
        lines={cart}
        total={cartTotal}
        buyerName={buyerName}
        buyerPhone={buyerPhone}
        notes={notes}
        submitting={submitting}
        expanded={cartExpanded}
        onToggle={() => setCartExpanded((v) => !v)}
        onSetQty={setQty}
        onName={setBuyerName}
        onPhone={setBuyerPhone}
        onNotes={setNotes}
        onSubmit={submitOrder}
      />
    </div>
  );
}
