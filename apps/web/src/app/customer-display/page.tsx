'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import {
  subscribeCustomerDisplay,
  CUSTOMER_DISPLAY_SUCCESS_MS,
  paymentShowsAliasOnCustomer,
  paymentShowsQrOnCustomer,
  type CustomerDisplayBroadcast,
} from '@/lib/customer-display-sync';

function formatMoney(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

type BusinessLite = {
  name: string;
  posConfig?: {
    branding?: { logoUrl?: string; appTitle?: string; accentColor?: string };
    customerDisplay?: {
      mercadopagoAlias?: string;
      mercadopagoQrUrl?: string;
      promoImageUrls?: string[];
    };
  };
};

export default function CustomerDisplayPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [business, setBusiness] = useState<BusinessLite | null>(null);
  const [live, setLive] = useState<CustomerDisplayBroadcast | null>(null);
  const [success, setSuccess] = useState<{ total: number; paymentLabel: string } | null>(null);
  const liveRef = useRef<CustomerDisplayBroadcast | null>(null);
  const successActiveRef = useRef(false);
  const [promoIdx, setPromoIdx] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const loadBusiness = useCallback(() => {
    api<BusinessLite>('/business/me')
      .then(setBusiness)
      .catch(() => setBusiness(null));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadBusiness();
  }, [ready, loadBusiness]);

  useEffect(() => {
    if (!ready) return;
    const unsub = subscribeCustomerDisplay((msg) => {
      if (msg.kind === 'success') {
        successActiveRef.current = true;
        setSuccess({ total: msg.total, paymentLabel: msg.paymentLabel });
        return;
      }
      if (msg.kind === 'sale') {
        liveRef.current = msg;
        if (successActiveRef.current) return;
        setLive(msg);
      }
    });
    return unsub;
  }, [ready]);

  useEffect(() => {
    if (!success) return;
    successActiveRef.current = true;
    const t = window.setTimeout(() => {
      successActiveRef.current = false;
      setSuccess(null);
      setLive(liveRef.current);
    }, CUSTOMER_DISPLAY_SUCCESS_MS);
    return () => clearTimeout(t);
  }, [success]);

  const phase =
    live?.kind === 'sale'
      ? live.phase
      : 'idle';

  const promos = business?.posConfig?.customerDisplay?.promoImageUrls?.filter(Boolean) ?? [];
  useEffect(() => {
    if (promos.length <= 1) return;
    const id = window.setInterval(() => setPromoIdx((i) => (i + 1) % promos.length), 6000);
    return () => clearInterval(id);
  }, [promos.length]);

  const accent = business?.posConfig?.branding?.accentColor?.trim() || '#10b981';
  const title = business?.posConfig?.branding?.appTitle?.trim() || business?.name || 'Tu negocio';
  const logoUrl = business?.posConfig?.branding?.logoUrl?.trim();
  const cd = business?.posConfig?.customerDisplay;
  const mpAlias = cd?.mercadopagoAlias?.trim();
  const mpQr = cd?.mercadopagoQrUrl?.trim();

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">
        Cargando…
      </div>
    );
  }

  const sale = live?.kind === 'sale' ? live : null;
  const showIdleCarousel = !success && phase === 'idle' && promos.length > 0;
  const showIdleFallback = !success && phase === 'idle' && promos.length === 0;

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col"
      style={{ ['--cd-accent' as string]: accent }}
    >
      <header className="shrink-0 px-8 py-6 border-b border-slate-800/80 flex items-center justify-center gap-4 bg-slate-950/60 backdrop-blur-sm">
        {logoUrl &&
        (logoUrl.startsWith('data:') || logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-16 w-16 md:h-20 md:w-20 rounded-2xl object-cover border border-slate-700 shadow-lg" />
        ) : (
          <div
            className="h-16 w-16 md:h-20 md:w-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg"
            style={{ backgroundColor: 'var(--cd-accent)' }}
          >
            {title.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="text-center min-w-0">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white truncate">{title}</h1>
          <p className="text-slate-500 text-sm md:text-base mt-1">Gracias por tu compra</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 p-6 md:p-10">
        {success && (
          <div className="flex-1 flex flex-col items-center justify-center rounded-3xl border-2 border-emerald-500/40 bg-emerald-950/40 px-6 py-16 text-center">
            <div
              className="w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center mb-8 shadow-xl shadow-emerald-900/50"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.25)' }}
            >
              <span className="text-5xl md:text-6xl" aria-hidden>
                ✓
              </span>
            </div>
            <p className="text-emerald-300 text-2xl md:text-4xl font-bold mb-3">Compra confirmada</p>
            <p className="text-emerald-100/90 text-xl md:text-3xl font-semibold">{formatMoney(success.total)}</p>
            <p className="text-emerald-200/70 text-lg mt-4">{success.paymentLabel}</p>
          </div>
        )}

        {!success && showIdleCarousel && (
          <div className="flex-1 flex flex-col min-h-0 rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/50">
            <div className="relative flex-1 min-h-[280px] md:min-h-[400px]">
              {promos.map((url, i) => (
                <div
                  key={i}
                  className={`absolute inset-0 transition-opacity duration-700 ${i === promoIdx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-contain bg-black/40" />
                </div>
              ))}
            </div>
            <p className="text-center text-slate-500 py-3 text-sm">Promociones · esperando tu pedido</p>
          </div>
        )}

        {!success && showIdleFallback && (
          <div className="flex-1 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/30 p-12 text-center">
            <p className="text-slate-400 text-xl md:text-2xl max-w-lg">
              Acá verás el detalle de tu compra cuando el cajero cargue productos. Podés cargar imágenes promocionales en Configuración.
            </p>
          </div>
        )}

        {!success && sale && sale.phase !== 'idle' && (
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full gap-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg md:text-xl font-semibold text-white">Tu pedido</h2>
              </div>
              <ul className="divide-y divide-slate-800">
                {sale.items.map((line, idx) => (
                  <li key={idx} className="px-6 py-4 flex flex-wrap justify-between gap-2 text-base md:text-lg">
                    <span className="text-slate-200 font-medium flex-1 min-w-0">{line.name}</span>
                    <span className="text-slate-500 tabular-nums">× {line.qty}</span>
                    <span className="text-slate-400 tabular-nums w-28 text-right">
                      {formatMoney(line.unitPrice)} c/u
                    </span>
                    <span className="font-semibold text-white tabular-nums w-36 text-right">
                      {formatMoney(line.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-6 py-5 space-y-3 bg-slate-950/40 border-t border-slate-800 text-lg md:text-xl">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(sale.subtotal)}</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Descuento</span>
                    <span className="tabular-nums">−{formatMoney(sale.discount)}</span>
                  </div>
                )}
                {sale.fiadoCustomerName && (
                  <p className="text-amber-300/90 text-base">Fiado: {sale.fiadoCustomerName}</p>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium text-xl md:text-2xl">Total</span>
                  <span
                    className="text-3xl md:text-5xl font-bold tabular-nums"
                    style={{ color: 'var(--cd-accent)' }}
                  >
                    {formatMoney(sale.total)}
                  </span>
                </div>
              </div>
            </div>

            {sale.phase === 'payment' && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 md:p-8 space-y-6">
                {!sale.selectedPaymentMethod && (
                  <p className="text-slate-400 text-center text-lg md:text-xl">
                    Total <strong className="text-white">{formatMoney(sale.total)}</strong>
                    <br />
                    <span className="text-slate-500 text-base mt-2 inline-block">
                      Esperá: el cajero va a elegir la forma de pago.
                    </span>
                  </p>
                )}
                {sale.selectedPaymentMethod &&
                  paymentShowsAliasOnCustomer(sale.selectedPaymentMethod) && (
                    <div className="space-y-4">
                      <p className="text-center text-slate-400 text-sm uppercase tracking-wide">
                        Transferencia / Mercado Pago — alias para pagar
                      </p>
                      {mpAlias ? (
                        <div className="text-center rounded-2xl bg-slate-800/80 border border-slate-600 px-6 py-8">
                          <p className="text-slate-500 text-sm mb-2">Alias</p>
                          <p className="text-2xl md:text-4xl font-mono font-bold text-white break-all">{mpAlias}</p>
                        </div>
                      ) : (
                        <p className="text-center text-amber-400/90">
                          El comercio no cargó un alias en Configuración → Pantalla cliente.
                        </p>
                      )}
                    </div>
                  )}
                {sale.selectedPaymentMethod &&
                  paymentShowsQrOnCustomer(sale.selectedPaymentMethod) && (
                    <div className="space-y-4">
                      <p className="text-center text-slate-400 text-sm uppercase tracking-wide">
                        Pago con tarjeta — escaneá el código
                      </p>
                      {mpQr &&
                      (mpQr.startsWith('data:') ||
                        mpQr.startsWith('http://') ||
                        mpQr.startsWith('https://')) ? (
                        <div className="flex justify-center">
                          <div className="rounded-2xl bg-white p-4 shadow-xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mpQr} alt="Código QR de pago" className="w-52 h-52 md:w-72 md:h-72 object-contain" />
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-amber-400/90">
                          El comercio no cargó el QR en Configuración → Pantalla cliente.
                        </p>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
