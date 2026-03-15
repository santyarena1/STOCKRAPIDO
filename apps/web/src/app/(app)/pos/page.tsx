'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, getToken } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

type CartItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
};

const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta_debito', label: 'Tarjeta débito' },
  { id: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'mercadopago', label: 'Mercado Pago' },
  { id: 'fiado', label: 'Fiado' },
];

const SHORTCUTS = [
  { key: 'F2', desc: 'Foco en búsqueda' },
  { key: '↑ / ↓', desc: 'Navegar resultados de búsqueda' },
  { key: 'ENTER', desc: 'Con resultados: agregar. Sin búsqueda: doble ENTER para cobrar' },
  { key: 'F4', desc: 'Aplicar descuento' },
  { key: 'F5', desc: 'Cobrar' },
  { key: '1-6', desc: 'En cobro: elegir forma de pago' },
  { key: 'F6', desc: 'Pausar venta / Nueva venta' },
  { key: 'ESC', desc: 'Cerrar modal' },
  { key: 'Ctrl+Backspace', desc: 'Quitar último ítem' },
];

/** Fila del carrito: lógica aislada, sin delegación ni handlers globales */
function CartItemRow({
  item,
  onMinus,
  onPlus,
  onQtyChange,
  onPriceChange,
  onRemove,
}: {
  item: CartItem;
  onMinus: () => void;
  onPlus: () => void;
  onQtyChange: (qty: number) => void;
  onPriceChange: (price: number) => void;
  onRemove: () => void;
}) {
  const handleMinus = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMinus();
  };
  const handlePlus = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPlus();
  };
  return (
    <li className="flex items-center justify-between gap-2 text-sm flex-wrap">
      <span className="text-slate-300 truncate flex-1 min-w-0 basis-full sm:basis-0">{item.name}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={handleMinus} className="w-7 h-7 rounded bg-slate-600 text-slate-200 hover:bg-slate-500" aria-label="Menos">
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={String(item.qty)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v === '') return;
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n >= 1) onQtyChange(n);
          }}
          onBlur={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            const n = parseInt(v, 10);
            if (v === '' || Number.isNaN(n) || n < 1) onQtyChange(1);
          }}
          className="w-10 text-center rounded bg-slate-700 border border-slate-600 text-slate-200 py-1 text-sm"
          aria-label="Cantidad"
        />
        <button type="button" onClick={handlePlus} className="w-7 h-7 rounded bg-slate-600 text-slate-200 hover:bg-slate-500" aria-label="Más">
          +
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-slate-500 text-xs">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={String(item.unitPrice)}
          onChange={(e) => {
            const v = e.target.value.replace(',', '.');
            if (v === '' || v === '.') return;
            const n = parseFloat(v);
            if (!Number.isNaN(n) && n >= 0) onPriceChange(n);
          }}
          onBlur={(e) => {
            const n = parseFloat(e.target.value.replace(',', '.'));
            if (Number.isNaN(n) || n < 0) onPriceChange(0);
          }}
          className="w-16 text-right rounded bg-slate-700 border border-slate-600 text-slate-200 py-1 text-sm"
          aria-label="Precio"
        />
      </div>
      <span className="text-sky-400 font-medium w-16 text-right shrink-0">${(item.subtotal - (item.discount || 0)).toFixed(0)}</span>
      <button type="button" onClick={onRemove} className="text-slate-500 hover:text-red-400 shrink-0" title="Quitar">×</button>
    </li>
  );
}

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; price: string; stock: number }[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; balance: string | number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pausedList, setPausedList] = useState<{ id: string; payload: { items: CartItem[]; discount?: number }; createdAt: string }[]>([]);
  const [discountInput, setDiscountInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastEnterForCobrarRef = useRef<number>(0);
  const DOUBLE_ENTER_MS = 800;
  // Evitar que React Strict Mode (doble invocación del updater) sume +2 en vez de +1
  const pendingQtyRef = useRef<{ productId: string; delta: number } | null>(null);
  const lastQtyResultRef = useRef<CartItem[] | null>(null);
  const isUpdateQtyRef = useRef(false);

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const total = Math.max(0, subtotal - discountTotal);

  const fetchPaused = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/paused-sales`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPausedList(data);
      }
    } catch {
      setPausedList([]);
    }
  }, []);

  useEffect(() => {
    if (showPaused) void fetchPaused();
  }, [showPaused, fetchPaused]);

  useEffect(() => {
    if (showCustomer) {
      fetch(`${API}/customers`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => r.ok ? r.json() : [])
        .then(setCustomers)
        .catch(() => setCustomers([]));
    }
  }, [showCustomer]);

  useEffect(() => {
    if (!search.trim() || !getToken()) {
      setResults([]);
      setSelectedResultIndex(0);
      return;
    }
    const term = search.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<Array<{ id: string; name: string; price: unknown; stock?: number }>>('/products/search', {
          params: { q: term, limit: '15' },
        });
        const list = Array.isArray(data) ? data : [];
        setResults(
          list.map((p) => ({
            id: p.id,
            name: p.name ?? '',
            price: typeof p.price === 'number' ? String(p.price) : (p.price?.toString?.() ?? '0'),
            stock: p.stock ?? 0,
          }))
        );
        setSelectedResultIndex(0);
      } catch {
        setResults([]);
        setSelectedResultIndex(0);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [search]);

  const handleCobrar = useCallback(async (paymentMethod: string) => {
    if (cart.length === 0) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: cart.map((i) =>
            i.productId.startsWith('manual-')
              ? { name: i.name, qty: i.qty, unitPrice: i.unitPrice }
              : { productId: i.productId, qty: i.qty, unitPrice: i.unitPrice }
          ),
          discount: discountTotal,
          customerId: selectedCustomer?.id,
          paymentMethod,
        }),
      });
      if (!res.ok) throw new Error('Error al registrar venta');
      setCart([]);
      setDiscountTotal(0);
      setSelectedCustomer(null);
      setSearch('');
      setShowPayment(false);
      searchRef.current?.focus();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  }, [cart, discountTotal, selectedCustomer?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts((s) => !s);
        return;
      }
      // No aplicar atajos si el foco está en el carrito (evitar acoplamiento con inputs de cantidad/precio)
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.('[data-pos-cart]')) return;
      if (showShortcuts || showDiscount || showManual || showPaused || showPayment || showCustomer) {
        if (e.key === 'Escape') {
          setShowShortcuts(false);
          setShowDiscount(false);
          setShowManual(false);
          setShowPaused(false);
          setShowPayment(false);
          setShowCustomer(false);
          e.preventDefault();
        }
        if (showPayment && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (PAYMENT_METHODS[idx]) {
            e.preventDefault();
            void handleCobrar(PAYMENT_METHODS[idx].id);
          }
        }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        setShowDiscount(true);
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        if (cart.length > 0) setShowPayment(true);
        return;
      }
      if (e.key === 'F6') {
        e.preventDefault();
        setShowPaused(true);
        return;
      }
      const searchFocused = document.activeElement === searchRef.current;
      if (searchFocused && results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedResultIndex((idx) => (idx < results.length - 1 ? idx + 1 : idx));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedResultIndex((idx) => (idx > 0 ? idx - 1 : 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const selected = results[Math.min(selectedResultIndex, results.length - 1)];
          if (selected) addToCart(selected);
          return;
        }
      }
      // Doble Enter con búsqueda vacía → abrir modal de cobro
      if (searchFocused && e.key === 'Enter' && cart.length > 0 && results.length === 0) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastEnterForCobrarRef.current <= DOUBLE_ENTER_MS) {
          lastEnterForCobrarRef.current = 0;
          setShowPayment(true);
        } else {
          lastEnterForCobrarRef.current = now;
        }
        return;
      }
      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCart((prev) => (prev.length ? prev.slice(0, -1) : prev));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showShortcuts, showDiscount, showManual, showPaused, showPayment, showCustomer, results, selectedResultIndex, cart.length, handleCobrar]);

  const addToCart = (product: { id: string; name: string; price: string }, qty = 1) => {
    const price = parseFloat(product.price) || 0;
    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === product.id);
      if (i >= 0) {
        const next = [...prev];
        next[i].qty += qty;
        next[i].subtotal = next[i].qty * next[i].unitPrice - (next[i].discount || 0);
        return next;
      }
      const subt = price * qty;
      return [...prev, { productId: product.id, name: product.name, qty, unitPrice: price, subtotal: subt, discount: 0 }];
    });
    setSearch('');
    setResults([]);
    searchRef.current?.focus();
  };

  const updateQty = useCallback((productId: string, delta: number) => {
    isUpdateQtyRef.current = true;
    pendingQtyRef.current = { productId, delta };
    setCart((prev) => {
      const pending = pendingQtyRef.current;
      if (!pending) {
        if (isUpdateQtyRef.current && lastQtyResultRef.current) {
          isUpdateQtyRef.current = false;
          return lastQtyResultRef.current;
        }
        return prev;
      }
      pendingQtyRef.current = null;
      const i = prev.findIndex((x) => x.productId === pending.productId);
      if (i < 0) return prev;
      const next = [...prev];
      next[i].qty = Math.max(0, next[i].qty + pending.delta);
      if (next[i].qty === 0) {
        const filtered = next.filter((_, j) => j !== i);
        lastQtyResultRef.current = filtered;
        return filtered;
      }
      next[i].subtotal = next[i].qty * next[i].unitPrice - (next[i].discount || 0);
      lastQtyResultRef.current = next;
      return next;
    });
  }, []);

  const setItemQty = (productId: string, newQty: number) => {
    const qty = Math.max(1, Math.floor(Number(newQty)) || 1);
    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === productId);
      if (i < 0) return prev;
      const next = [...prev];
      next[i].qty = qty;
      next[i].subtotal = next[i].qty * next[i].unitPrice - (next[i].discount || 0);
      return next;
    });
  };

  const setItemPrice = (productId: string, newPrice: number) => {
    const price = Math.max(0, Number(newPrice) || 0);
    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === productId);
      if (i < 0) return prev;
      const next = [...prev];
      next[i].unitPrice = price;
      next[i].subtotal = next[i].qty * price - (next[i].discount || 0);
      return next;
    });
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((x) => x.productId !== productId));
  };

  const applyDiscount = () => {
    const v = parseFloat(discountInput.replace(',', '.'));
    if (!Number.isNaN(v) && v >= 0) setDiscountTotal(v);
    setShowDiscount(false);
    setDiscountInput('');
  };

  const savePaused = async () => {
    if (cart.length === 0) {
      setShowPaused(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API}/paused-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: cart, discount: discountTotal }),
      });
      setCart([]);
      setDiscountTotal(0);
      setShowPaused(false);
      fetchPaused();
      searchRef.current?.focus();
    } catch {
      alert('Error al guardar venta en espera');
    }
  };

  const restorePaused = (payload: { items: CartItem[]; discount?: number }) => {
    setCart(payload.items || []);
    setDiscountTotal(payload.discount || 0);
    setShowPaused(false);
  };

  const addManualProduct = () => {
    const name = manualName.trim() || 'Producto manual';
    const price = parseFloat(manualPrice.replace(',', '.')) || 0;
    if (price <= 0) return;
    addToCart({ id: `manual-${Date.now()}`, name, price: String(price) });
    setManualName('');
    setManualPrice('');
    setShowManual(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white">POS</h1>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          data-tour="pos-shortcuts"
          className="text-slate-400 hover:text-white text-sm px-2 py-1 rounded"
          title="Atajos (?)"
        >
          ?
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 min-h-0">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="mb-2 flex gap-2">
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar por nombre o código de barras (F2)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-tour="pos-search"
              className="flex-1 px-4 py-3 text-lg rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowManual(true)}
              data-tour="pos-manual"
              className="px-4 py-3 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 whitespace-nowrap"
            >
              Producto manual
            </button>
          </div>
          <div data-tour="pos-results" className="flex-1 overflow-auto rounded-lg border border-slate-700 bg-slate-800/30 min-h-[200px]">
            {loading && <p className="p-2 text-slate-500">Buscando...</p>}
            {!loading && results.length > 0 && (
              <ul className="divide-y divide-slate-700">
                {results.map((p, idx) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      className={`w-full text-left px-4 py-3 flex justify-between items-center hover:bg-slate-700/50 ${idx === selectedResultIndex ? 'bg-sky-600/30 ring-1 ring-sky-500/50' : ''}`}
                    >
                      <span className="text-slate-200">{p.name}</span>
                      <span className="text-sky-400 font-medium">${parseFloat(p.price).toFixed(0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-900/50 overflow-hidden min-h-0" data-pos-cart>
          <div className="px-4 py-2 border-b border-slate-700 font-medium text-slate-300 flex justify-between">
            <span>Carrito</span>
            {discountTotal > 0 && <span className="text-amber-400">-${discountTotal.toFixed(0)}</span>}
          </div>
          <div className="flex-1 overflow-auto p-2 min-h-[120px]">
            {cart.length === 0 ? (
              <p className="text-slate-500 text-sm p-4">Agregá productos con la búsqueda, escaneando código o producto manual.</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((i) => (
                  <CartItemRow
                    key={i.productId}
                    item={i}
                    onMinus={() => updateQty(i.productId, -1)}
                    onPlus={() => updateQty(i.productId, 1)}
                    onQtyChange={(qty) => setItemQty(i.productId, qty)}
                    onPriceChange={(price) => setItemPrice(i.productId, price)}
                    onRemove={() => removeItem(i.productId)}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="p-4 border-t border-slate-700 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(0)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Descuento (F4)</span>
                <span>-${discountTotal.toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-100">
              <span>Total</span>
              <span>${total.toFixed(0)}</span>
            </div>
            {selectedCustomer && (
              <p className="text-amber-400 text-sm">Al fiado: {selectedCustomer.name}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCustomer(true)}
                data-tour="pos-fiado"
                className={`flex-1 py-3 rounded-lg font-medium ${selectedCustomer ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white hover:bg-slate-500'}`}
              >
                {selectedCustomer ? 'Fiado: ' + selectedCustomer.name : 'Vender al fiado'}
              </button>
              <button
                type="button"
                onClick={() => setShowPaused(true)}
                data-tour="pos-pausar"
                className="flex-1 py-3 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-500"
              >
                Pausar (F6)
              </button>
              <button
                type="button"
                onClick={() => cart.length > 0 && setShowPayment(true)}
                disabled={cart.length === 0}
                data-tour="pos-cobrar"
                className="flex-1 py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cobrar (F5)
              </button>
            </div>
          </div>
        </div>
      </div>

      {showShortcuts && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Atajos de teclado</h2>
            <ul className="space-y-2 text-slate-300">
              {SHORTCUTS.map(({ key, desc }) => (
                <li key={key} className="flex justify-between">
                  <kbd className="px-2 py-0.5 rounded bg-slate-700 text-sky-400 font-mono text-sm">{key}</kbd>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-slate-500 text-sm">Presioná ? para cerrar</p>
          </div>
        </div>
      )}

      {showDiscount && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDiscount(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Descuento total (monto)</h2>
            <input
              type="text"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDiscount(false)} className="flex-1 py-2 rounded-lg bg-slate-600 text-white">Cancelar</button>
              <button type="button" onClick={applyDiscount} className="flex-1 py-2 rounded-lg bg-sky-600 text-white">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPayment(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-2">¿Cómo pagó el cliente?</h2>
            <p className="text-slate-400 text-sm mb-4">Total a cobrar: ${total.toFixed(0)} · Usá 1-6 para elegir</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PAYMENT_METHODS.map((pm, idx) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => void handleCobrar(pm.id)}
                  className="px-4 py-3 rounded-lg bg-slate-700 text-slate-200 hover:bg-sky-600 hover:text-white font-medium text-left flex items-center gap-2"
                >
                  <span className="w-6 h-6 rounded bg-slate-600 text-sky-400 font-bold text-sm flex items-center justify-center shrink-0">{idx + 1}</span>
                  {pm.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowPayment(false)} className="w-full py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showManual && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowManual(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Producto manual</h2>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nombre"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 mb-2"
            />
            <input
              type="text"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Precio"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && addManualProduct()}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowManual(false)} className="flex-1 py-2 rounded-lg bg-slate-600 text-white">Cancelar</button>
              <button type="button" onClick={addManualProduct} className="flex-1 py-2 rounded-lg bg-sky-600 text-white">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {showPaused && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPaused(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Ventas en espera</h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={savePaused}
                className="w-full py-2 rounded-lg bg-sky-600 text-white mb-4"
              >
                Guardar venta actual en espera
              </button>
            )}
            {pausedList.length === 0 ? (
              <p className="text-slate-500 text-sm">No hay ventas pausadas.</p>
            ) : (
              <ul className="space-y-2">
                {pausedList.map((p) => (
                  <li key={p.id} className="flex justify-between items-center gap-2 p-2 rounded bg-slate-800">
                    <span className="text-slate-300 text-sm truncate">
                      {(p.payload?.items as CartItem[])?.length || 0} ítems · {new Date(p.createdAt).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => restorePaused(p.payload as { items: CartItem[]; discount?: number })}
                      className="px-3 py-1 rounded bg-sky-600 text-white text-sm"
                    >
                      Retomar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setShowPaused(false)} className="mt-4 w-full py-2 rounded-lg border border-slate-600 text-slate-300">Cerrar</button>
          </div>
        </div>
      )}

      {showCustomer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCustomer(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Vender al fiado</h2>
            <button
              type="button"
              onClick={() => { setSelectedCustomer(null); setShowCustomer(false); }}
              className="w-full py-2 rounded-lg bg-slate-600 text-white mb-2"
            >
              Cobro normal (sin fiado)
            </button>
            <ul className="space-y-2">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomer({ id: c.id, name: c.name }); setShowCustomer(false); }}
                    className="w-full text-left px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    {c.name} {Number(c.balance) > 0 && <span className="text-amber-400 text-sm">(saldo: ${Number(c.balance).toFixed(0)})</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowCustomer(false)} className="mt-4 w-full py-2 rounded-lg border border-slate-600 text-slate-300">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
