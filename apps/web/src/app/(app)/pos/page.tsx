'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl, getToken } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import {
  broadcastCustomerDisplay,
  openCustomerDisplayWindow,
  paymentNeedsCustomerConfirmStep,
} from '@/lib/customer-display-sync';
import { FiscalReceiptModal, printFiscalReceipt } from '@/components/FiscalCheckout';
import { Search, ShoppingCart } from 'lucide-react';
import { Loader } from '@/components/ui/Loader';

type CartItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  imageUrl?: string | null;
};
type Vendedor = { id: string; name: string; active: boolean };

type PausedSalePayload={items:CartItem[];discount?:number;selectedCustomer?:{id:string;name:string}|null;paymentMethod?:string|null;status?:'building'|'awaiting_payment'};type PausedSale={id:string;payload:PausedSalePayload;createdAt:string};

/** Mismo umbral que reportes críticos: aviso solo al agregar ese producto al carrito */
const LOW_STOCK_THRESHOLD = 3;

const normalizeSearchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const highlightedName = (name: string, query: string) => {
  const normalizedName = normalizeSearchText(name);
  const candidates = [query.trim(), ...query.trim().split(/\s+/)].filter(Boolean);
  const match = candidates
    .map((candidate) => ({ index: normalizedName.indexOf(normalizeSearchText(candidate)), length: candidate.length }))
    .find((candidate) => candidate.index >= 0);
  if (!match) return name;
  return <>{name.slice(0, match.index)}<mark className="bg-transparent font-bold text-brand">{name.slice(match.index, match.index + match.length)}</mark>{name.slice(match.index + match.length)}</>;
};

type SearchMatch = 'nombre' | 'codigo' | 'sku' | 'ref' | 'bulto' | 'marca';

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
  { key: 'ENTER', desc: 'Con resultados: agregar. Código de barras completo: se agrega solo. Sin búsqueda: doble ENTER para cobrar' },
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
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="w-8 h-8 object-contain rounded bg-white/5 shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-raised2 shrink-0" />
      )}
      <span className="text-fg-muted truncate flex-1 min-w-0 basis-full sm:basis-0">{item.name}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={handleMinus} className="w-7 h-7 rounded bg-raised2 text-fg hover:bg-raised2" aria-label="Menos">
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
          className="w-10 text-center rounded bg-raised2 border border-hair text-fg py-1 text-sm"
          aria-label="Cantidad"
        />
        <button type="button" onClick={handlePlus} className="w-7 h-7 rounded bg-raised2 text-fg hover:bg-raised2" aria-label="Más">
          +
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-fg-faint text-xs">$</span>
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
          className="w-16 text-right rounded bg-raised2 border border-hair text-fg py-1 text-sm"
          aria-label="Precio unitario"
        />
        <span className="text-fg-faint text-[10px] shrink-0">c/u</span>
      </div>
      <span className="text-brand font-medium w-16 text-right shrink-0">${(item.subtotal - (item.discount || 0)).toFixed(0)}</span>
      <button type="button" onClick={onRemove} className="text-fg-faint hover:text-red-400 shrink-0" title="Quitar">×</button>
    </li>
  );
}

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<
    {
      id: string;
      name: string;
      price: string;
      stock: number;
      stockControl: boolean;
      barcode?: string | null;
      eanBox?: string | null;
      supplierSku?: string | null;
      supplierRef?: string | null;
      externalId?: string | null;
      matched?: SearchMatch;
      imageUrl?: string | null;
      unitsPerBox?: string | null;
      unitsPerBoxNum?: number | null;
      cost?: unknown;
    }[]
  >([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [showSeller, setShowSeller] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  /** Transferencia / MP / tarjetas: primero elegís método (cliente ve alias o QR), luego "Confirmar cobro" */
  const [paymentMethodPending, setPaymentMethodPending] = useState<string | null>(null);
  const [cashPaid, setCashPaid] = useState<number | null>(null); // con cuánto pagó en efectivo (para el vuelto)
  const [fiscalMode,setFiscalMode]=useState<'internal'|'factura_c'>('internal');
  const [printEnabled,setPrintEnabled]=useState(true);
  const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; balance: string | number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pausedList,setPausedList]=useState<PausedSale[]>([]);
  const [discountInput, setDiscountInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [sellers, setSellers] = useState<Vendedor[]>([]);
  const [activeSeller, setActiveSeller] = useState<Vendedor | null>(null);
  const [sellerBusy, setSellerBusy] = useState(false);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [assocMsg, setAssocMsg] = useState('');
  const [assocCode, setAssocCode] = useState(''); // código fijado para asociar buscando el producto por nombre
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastEnterForCobrarRef = useRef<number>(0);
  const DOUBLE_ENTER_MS = 800;
  // Evitar que React Strict Mode (doble invocación del updater) sume +2 en vez de +1
  const pendingQtyRef = useRef<{ productId: string; delta: number } | null>(null);
  const lastQtyResultRef = useRef<CartItem[] | null>(null);
  const isUpdateQtyRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const [cobrandoBusy, setCobrandoBusy] = useState(false);
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem('stockrapido:pos-preferences')||'{}');if(v.fiscalMode==='internal'||v.fiscalMode==='factura_c')setFiscalMode(v.fiscalMode);if(typeof v.printEnabled==='boolean')setPrintEnabled(v.printEnabled)}catch{}setPreferencesLoaded(true)},[]);
  useEffect(()=>{if(preferencesLoaded)localStorage.setItem('stockrapido:pos-preferences',JSON.stringify({fiscalMode,printEnabled}))},[fiscalMode,printEnabled,preferencesLoaded]);
  useEffect(() => {
    api<{ posConfig?: { hiddenCategoryIds?: string[] } }>('/business/me')
      .then((business) => {
        const ids = business.posConfig?.hiddenCategoryIds;
        setHiddenCategoryIds(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
      })
      .catch(() => setHiddenCategoryIds([]));
  }, []);
  useEffect(() => {
    resultsRef.current?.querySelector<HTMLElement>(`[data-result-index="${selectedResultIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedResultIndex]);

  /** Caja abierta: las ventas se vinculan para el arqueo (cierre de caja). Fiado no suma efectivo. */
  const [openCashRegisterId, setOpenCashRegisterId] = useState<string | null>(null);
  const [showOpenCaja, setShowOpenCaja] = useState(false);
  const [openCajaCash, setOpenCajaCash] = useState('');
  const [openCajaBank, setOpenCajaBank] = useState('0');
  const [openCajaNotes, setOpenCajaNotes] = useState('');
  const [openCajaBusy, setOpenCajaBusy] = useState(false);
  /** Tras abrir caja desde F5/doble Enter, abrir modal de cobro automáticamente */
  const pendingPaymentAfterOpenRef = useRef(false);

  /** Aviso no intrusivo solo si acabás de agregar un ítem con stock ≤ umbral */
  const [lowStockNotice, setLowStockNotice] = useState<{ name: string; stock: number } | null>(null);
  const lowStockNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (lowStockNoticeTimerRef.current) clearTimeout(lowStockNoticeTimerRef.current);
    };
  }, []);

  /** Pantalla cliente (segundo monitor): estado en tiempo real vía BroadcastChannel */
  useEffect(() => {
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.max(0, subtotal - discountTotal);
    const phase: 'idle' | 'cart' | 'payment' = showPayment
      ? 'payment'
      : cart.length > 0
        ? 'cart'
        : 'idle';
    broadcastCustomerDisplay({
      kind: 'sale',
      phase,
      selectedPaymentMethod: showPayment ? paymentMethodPending : null,
      items: cart.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.subtotal - (i.discount || 0),
        imageUrl: i.imageUrl ?? null,
      })),
      subtotal,
      discount: discountTotal,
      total,
      fiadoCustomerName: selectedCustomer?.name ?? null,
    });
  }, [cart, discountTotal, showPayment, paymentMethodPending, selectedCustomer?.name]);

  useEffect(() => {
    if (!showPayment) { setPaymentMethodPending(null); setCashPaid(null); }
  }, [showPayment]);

  const refreshOpenCashRegister = useCallback(async (): Promise<string | null> => {
    try {
      const data = await api<{ id: string } | null>('/caja/open');
      const id = data?.id ?? null;
      setOpenCashRegisterId(id);
      return id;
    } catch {
      setOpenCashRegisterId(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshOpenCashRegister();
  }, [refreshOpenCashRegister]);

  useEffect(() => {
    if (showPayment) void refreshOpenCashRegister();
  }, [showPayment, refreshOpenCashRegister]);

  const handleOpenCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(openCajaCash.replace(',', '.')) || 0;
    const bank = parseFloat(openCajaBank.replace(',', '.')) || 0;
    if (cash < 0 || bank < 0) return;
    setOpenCajaBusy(true);
    try {
      const reg = await api<{ id: string }>('/caja/open', {
        method: 'POST',
        body: JSON.stringify({
          openingCash: cash,
          openingBank: bank,
          notes: openCajaNotes.trim() || undefined,
        }),
      });
      setOpenCashRegisterId(reg.id);
      setOpenCajaCash('');
      setOpenCajaBank('0');
      setOpenCajaNotes('');
      setShowOpenCaja(false);
      if (pendingPaymentAfterOpenRef.current && cart.length > 0) {
        pendingPaymentAfterOpenRef.current = false;
        setShowPayment(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al abrir caja');
    } finally {
      setOpenCajaBusy(false);
    }
  };

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const total = Math.max(0, subtotal - discountTotal);
  const openPayment = () => {
    if (cart.length === 0) return;
    if (!openCashRegisterId) {
      pendingPaymentAfterOpenRef.current = true;
      setShowOpenCaja(true);
      return;
    }
    setShowPayment(true);
  };

  const fetchPaused = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/paused-sales`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPausedList(data);
      }
    } catch {
      setPausedList([]);
    }
  }, []);

  useEffect(()=>{void fetchPaused()},[fetchPaused]);
  useEffect(() => {
    Promise.allSettled([api<Vendedor | null>('/vendedores/active'), api<Vendedor[]>('/vendedores')]).then(([activeResult, sellersResult]) => {
      if (activeResult.status === 'fulfilled') setActiveSeller(activeResult.value);
      if (sellersResult.status === 'fulfilled') setSellers(sellersResult.value);
    });
  }, []);

  const addToCart = useCallback(
    (
      product: { id: string; name: string; price: string; stock?: number; stockControl?: boolean; imageUrl?: string | null },
      qty = 1,
    ) => {
    const price = parseFloat(product.price) || 0;
    const trackStock = product.stockControl !== false;
    const st = product.stock;

    setCart((prev) => {
      const i = prev.findIndex((x) => x.productId === product.id);
      const isNewLine = i < 0;
      if (
        isNewLine &&
        trackStock &&
        typeof st === 'number' &&
        st <= LOW_STOCK_THRESHOLD &&
        !product.id.startsWith('manual-')
      ) {
        queueMicrotask(() => {
          if (lowStockNoticeTimerRef.current) clearTimeout(lowStockNoticeTimerRef.current);
          setLowStockNotice({ name: product.name, stock: st });
          lowStockNoticeTimerRef.current = setTimeout(() => {
            setLowStockNotice(null);
            lowStockNoticeTimerRef.current = null;
          }, 7000);
        });
      }
      if (i >= 0) {
        const next = [...prev];
        next[i].qty += qty;
        next[i].subtotal = next[i].qty * next[i].unitPrice - (next[i].discount || 0);
        return next;
      }
      const subt = price * qty;
      return [...prev, { productId: product.id, name: product.name, qty, unitPrice: price, subtotal: subt, discount: 0, imageUrl: product.imageUrl ?? null }];
    });
    setSearch('');
    setResults([]);
    searchRef.current?.focus();
  }, []);

  const associateCode = useCallback(async (product: { id: string; name: string; price: string; stock?: number; stockControl?: boolean; imageUrl?: string | null }, code: string) => {
    const c = code.trim();
    if (!c) return;
    try {
      await api(`/products/${product.id}/add-code`, { method: 'POST', body: JSON.stringify({ code: c }) });
      setAssocMsg(`Código ${c} asociado a “${product.name}”`);
      window.setTimeout(() => setAssocMsg(''), 4000);
      setAssocCode('');
      addToCart(product);
    } catch {
      setAssocMsg('No se pudo asociar el código.');
      window.setTimeout(() => setAssocMsg(''), 4000);
    }
  }, [addToCart]);

  useEffect(() => {
    if (showCustomer) {
      fetch(`${getApiBaseUrl()}/customers`, { headers: { Authorization: `Bearer ${getToken()}` } })
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
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<
          Array<{
            id: string;
            name: string;
            price: unknown;
            stock?: number;
            stockControl?: boolean;
            barcode?: string | null;
            eanBox?: string | null;
            supplierSku?: string | null;
            supplierRef?: string | null;
            externalId?: string | null;
            matched?: SearchMatch;
            imageUrl?: string | null;
            unitsPerBox?: string | null;
            unitsPerBoxNum?: number | null;
            cost?: unknown;
          }>
        >('/products/search', {
          params: {
            q: term,
            limit: '40',
            excludeCombos: '1',
            excludeCategoryIds: hiddenCategoryIds.length ? hiddenCategoryIds.join(',') : undefined,
          },
        });
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const mapped = list.map((p) => ({
          id: p.id,
          name: p.name ?? '',
          price: typeof p.price === 'number' ? String(p.price) : (p.price?.toString?.() ?? '0'),
          stock: p.stock ?? 0,
          stockControl: p.stockControl !== false,
          barcode: p.barcode ?? null,
          eanBox: p.eanBox ?? null,
          supplierSku: p.supplierSku ?? null,
          supplierRef: p.supplierRef ?? null,
          externalId: p.externalId ?? null,
          matched: p.matched,
          imageUrl: p.imageUrl ?? null,
          unitsPerBox: p.unitsPerBox ?? null,
          unitsPerBoxNum: p.unitsPerBoxNum ?? null,
          cost: p.cost ?? null,
        }));
        if (mapped.length === 1 && [mapped[0].barcode, mapped[0].eanBox, mapped[0].supplierSku, mapped[0].supplierRef, mapped[0].externalId].includes(term)) {
          addToCart(mapped[0], 1);
          return;
        }
        setResults(mapped);
        setSelectedResultIndex(0);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSelectedResultIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, addToCart, hiddenCategoryIds]);

  const handleCobrar=useCallback(async(paymentMethod:string)=>{if(!cart.length||isSubmittingRef.current)return;const token=getToken();if(!token)return;const popup=printEnabled?window.open('','_blank','width=420,height=720'):null;isSubmittingRef.current=true;setCobrandoBusy(true);try{const crId=await refreshOpenCashRegister();if(!crId){popup?.close();alert('Tenés que abrir la caja antes de registrar ventas.');return}const res=await fetch(getApiBaseUrl()+'/sales',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({items:cart.map(i=>i.productId.startsWith('manual-')?{name:i.name,qty:i.qty,unitPrice:i.unitPrice}:{productId:i.productId,qty:i.qty,unitPrice:i.unitPrice}),discount:discountTotal,customerId:selectedCustomer?.id,paymentMethod,cashRegisterId:crId,fiscalMode,sellerId:activeSeller?.id??null})});if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.message||'Error al registrar venta')}const sale=await res.json(),receipt=await api<any>('/fiscal/sales/'+sale.id+'/receipt'),fiscalError=receipt?.fiscalDocument?.status==='ERROR';if(fiscalError){popup?.close();setReceipt(receipt)}const total=Math.max(0,cart.reduce((n,i)=>n+i.subtotal,0)-discountTotal),paymentLabel=PAYMENT_METHODS.find(i=>i.id===paymentMethod)?.label??paymentMethod;broadcastCustomerDisplay({kind:'success',total,paymentMethod,paymentLabel});setCart([]);setDiscountTotal(0);setSelectedCustomer(null);setSearch('');setPaymentMethodPending(null);setShowPayment(false);searchRef.current?.focus();if(!fiscalError&&printEnabled)await printFiscalReceipt(receipt,popup);else if(!fiscalError)popup?.close()}catch(e){popup?.close();alert(e instanceof Error?e.message:'Error')}finally{isSubmittingRef.current=false;setCobrandoBusy(false)}},[cart,discountTotal,selectedCustomer?.id,refreshOpenCashRegister,fiscalMode,printEnabled,activeSeller?.id]);
  const pickPaymentMethod=useCallback((id:string)=>{if(!openCashRegisterId)return;if(id==='efectivo'){setCashPaid(null);setPaymentMethodPending('efectivo');return}paymentNeedsCustomerConfirmStep(id)?setPaymentMethodPending(id):void handleCobrar(id)},[openCashRegisterId,handleCobrar]);
  const confirmPendingPayment=useCallback(()=>{if(paymentMethodPending&&openCashRegisterId)void handleCobrar(paymentMethodPending)},[paymentMethodPending,openCashRegisterId,handleCobrar]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts((s) => !s);
        return;
      }
      // No aplicar atajos si el foco está en el carrito (evitar acoplamiento con inputs de cantidad/precio)
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.('[data-pos-cart]')) return;
      if (showShortcuts || showDiscount || showManual || showQuickProduct || showSeller || showPaused || showPayment || showCustomer || showOpenCaja || showMobileCart) {
        if (e.key === 'Escape') {
          setShowShortcuts(false);
          setShowDiscount(false);
          setShowManual(false);
          setShowQuickProduct(false);
          setShowSeller(false);
          setShowPaused(false);
          setShowPayment(false);
          setShowCustomer(false);
          setShowOpenCaja(false);
          setShowMobileCart(false);
          e.preventDefault();
        }
        if (
          showPayment &&
          e.key === 'Enter' &&
          paymentMethodPending &&
          openCashRegisterId
        ) {
          e.preventDefault();
          confirmPendingPayment();
          return;
        }
        const typingInField = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        if (showPayment && !typingInField && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (PAYMENT_METHODS[idx]) {
            e.preventDefault();
            pickPaymentMethod(PAYMENT_METHODS[idx].id);
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
        if (cart.length === 0) return;
        if (!openCashRegisterId) {
          pendingPaymentAfterOpenRef.current = true;
          setShowOpenCaja(true);
          return;
        }
        setShowPayment(true);
        return;
      }
      if (e.key === 'F6') {
        e.preventDefault();
        setShowPaused(true);
        return;
      }
      const searchFocused = document.activeElement === searchRef.current;
      if (searchFocused && e.key === 'Escape') {
        e.preventDefault();
        setSearch('');
        setResults([]);
        setSelectedResultIndex(0);
        return;
      }
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
        if (!openCashRegisterId) {
          pendingPaymentAfterOpenRef.current = true;
          setShowOpenCaja(true);
          return;
        }
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
  }, [
    showShortcuts,
    showDiscount,
    showManual,
    showQuickProduct,
    showSeller,
    showPaused,
    showPayment,
    showCustomer,
    showOpenCaja,
    showMobileCart,
    results,
    selectedResultIndex,
    cart.length,
    pickPaymentMethod,
    confirmPendingPayment,
    paymentMethodPending,
    openCashRegisterId,
    addToCart,
  ]);

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

  const savePaused=async(paymentMethod:string|null=null,status:'building'|'awaiting_payment'='building')=>{if(!cart.length){setShowPaused(false);return}const token=getToken();if(!token)return;try{const r=await fetch(getApiBaseUrl()+'/paused-sales',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({items:cart,discount:discountTotal,selectedCustomer,paymentMethod,status})});if(!r.ok)throw Error();setCart([]);setDiscountTotal(0);setSelectedCustomer(null);setPaymentMethodPending(null);setShowPayment(false);setShowPaused(false);await fetchPaused();searchRef.current?.focus()}catch{alert('Error al guardar venta en espera')}};
  const restorePaused=async(p:PausedSale)=>{const v=p.payload||{items:[]};setCart(v.items||[]);setDiscountTotal(v.discount||0);setSelectedCustomer(v.selectedCustomer||null);setShowPaused(false);setPausedList(x=>x.filter(i=>i.id!==p.id));const token=getToken();if(token)void fetch(getApiBaseUrl()+'/paused-sales/'+p.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});if(v.status==='awaiting_payment'&&v.paymentMethod){setPaymentMethodPending(v.paymentMethod);setShowPayment(true)}else{setPaymentMethodPending(null);setTimeout(()=>searchRef.current?.focus(),0)}};

  const addManualProduct = () => {
    const name = manualName.trim() || 'Producto manual';
    const price = parseFloat(manualPrice.replace(',', '.')) || 0;
    if (price <= 0) return;
    addToCart({ id: `manual-${Date.now()}`, name, price: String(price) });
    setManualName('');
    setManualPrice('');
    setShowManual(false);
  };

  const createQuickProduct = async () => {
    const name = quickName.trim();
    const price = Number(quickPrice.replace(',', '.'));
    if (!name) return alert('Ingresá un nombre.');
    if (!Number.isFinite(price) || price < 0) return alert('Ingresá un precio válido.');
    setQuickBusy(true);
    try {
      const product = await api<{ id: string; name: string; price: string; stock: number; stockControl: boolean; imageUrl?: string | null }>('/products/quick', {
        method: 'POST',
        body: JSON.stringify({ name, price, barcode: quickBarcode.trim() || undefined }),
      });
      addToCart(product);
      setQuickName('');
      setQuickPrice('');
      setQuickBarcode('');
      setShowQuickProduct(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al crear el producto rápido');
    } finally {
      setQuickBusy(false);
    }
  };

  const changeSeller = async (seller: Vendedor) => {
    if (!confirm(`¿Cambiar el vendedor a ${seller.name}?`)) return;
    setSellerBusy(true);
    try {
      const selected = await api<Vendedor>('/vendedores/set-active', { method: 'POST', body: JSON.stringify({ vendedorId: seller.id }) });
      setActiveSeller(selected);
      localStorage.setItem('sr-vendedor', selected.id);
      setShowSeller(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al cambiar vendedor');
    } finally {
      setSellerBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-app">
      <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-hair-soft bg-surface flex flex-wrap items-center gap-2 sm:gap-3"><span className="w-full text-xs font-semibold text-fg-muted uppercase sm:w-auto">Próximas ventas</span><div className="inline-flex max-w-full rounded-lg border border-hair overflow-x-auto"><button type="button" onClick={()=>setFiscalMode('internal')} className={'whitespace-nowrap px-3 py-2 text-sm font-semibold '+(fiscalMode==='internal'?'bg-[var(--warn-soft)] text-warn':'bg-raised text-fg-muted')}>Comprobante interno</button><button type="button" onClick={()=>setFiscalMode('factura_c')} className={'whitespace-nowrap px-3 py-2 text-sm font-semibold '+(fiscalMode==='factura_c'?'bg-[var(--ok-soft)] text-ok':'bg-raised text-fg-muted')}>Factura C</button></div><div className="inline-flex rounded-lg border border-hair overflow-hidden"><button type="button" onClick={()=>setPrintEnabled(true)} className={'px-3 py-2 text-sm font-semibold '+(printEnabled?'bg-brand-highlight text-brand':'bg-raised text-fg-muted')}>Imprimir</button><button type="button" onClick={()=>setPrintEnabled(false)} className={'px-3 py-2 text-sm font-semibold '+(!printEnabled?'bg-raised2 text-fg':'bg-raised text-fg-muted')}>No imprimir</button></div><div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">{sellers.length === 0 ? <Link href="/config/vendedores" className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] px-3 py-2 text-sm text-warn">Creá vendedores en Configuración</Link> : <><span className="rounded-lg border border-[color:var(--brand-accent)] bg-brand-highlight px-3 py-2 text-sm font-semibold text-brand">Vendedor: <strong>{activeSeller?.name ?? 'Sin seleccionar'}</strong></span><button type="button" onClick={() => setShowSeller(true)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Cambiar vendedor</button></>}<button type="button" onClick={()=>{setShowPaused(true);void fetchPaused()}} className="px-3 py-2 rounded-lg border border-hair text-sm text-fg-muted hover:bg-raised">En espera ({pausedList.length})</button></div></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair-soft bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold leading-tight text-fg">POS</h1>
          {openCashRegisterId ? (
            <span className="text-xs text-emerald-400/90 border border-emerald-700/50 rounded px-2 py-0.5" title="Las ventas (excepto fiado) se suman al cierre de caja">
              Caja abierta
            </span>
          ) : (
            <>
              <span className="text-xs text-fg-faint" title="Abrí turno para vincular ventas al arqueo">
                Sin caja abierta
              </span>
              <button
                type="button"
                onClick={() => {
                  pendingPaymentAfterOpenRef.current = false;
                  setShowOpenCaja(true);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-amber-600/90 text-fg font-medium hover:bg-amber-500"
              >
                Abrir caja
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCustomerDisplayWindow()}
            className="text-xs px-3 py-1.5 rounded-lg border border-hair text-fg hover:bg-raised font-semibold tracking-wide"
            title="Abre la pantalla para el cliente (segundo monitor)"
          >
            VISTA CLIENTE
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            data-tour="pos-shortcuts"
            className="text-fg-muted hover:text-fg text-sm px-2 py-1 rounded"
            title="Atajos (?)"
          >
            ?
          </button>
        </div>
      </div>

      {lowStockNotice && (
        <div
          className="shrink-0 mx-4 mb-1 rounded-lg border border-amber-600/35 bg-amber-950/25 px-3 py-2 text-amber-100/95 text-sm flex flex-wrap items-center justify-between gap-2"
          role="status"
          aria-live="polite"
        >
          <span>
            <span className="font-semibold text-amber-300">Stock bajo: </span>
            <span className="text-amber-100/90">
              “{lowStockNotice.name}” — quedan {lowStockNotice.stock} u. (≤{LOW_STOCK_THRESHOLD})
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (lowStockNoticeTimerRef.current) clearTimeout(lowStockNoticeTimerRef.current);
              lowStockNoticeTimerRef.current = null;
              setLowStockNotice(null);
            }}
            className="text-amber-400/80 hover:text-amber-200 text-lg leading-none px-1"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-3 pb-24 sm:p-4 sm:pb-24 lg:grid-cols-3 lg:overflow-hidden lg:pb-4">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="mb-2 flex flex-wrap gap-2 sm:flex-nowrap">
            <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar por nombre o código de barras (F2)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-tour="pos-search"
              className="w-full rounded-lg border border-hair bg-raised py-3 pl-12 pr-4 text-lg text-fg placeholder:text-fg-faint focus-brand"
              autoFocus
            />
            </div>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              data-tour="pos-manual"
              className="flex-1 whitespace-nowrap rounded-lg border border-hair bg-raised px-3 py-3 text-fg-muted hover:bg-raised2 hover:text-fg sm:flex-none sm:px-4"
            >
              Producto manual
            </button>
            <button type="button" onClick={() => setShowQuickProduct(true)} className="flex-1 whitespace-nowrap rounded-lg border border-warn/30 bg-[var(--warn-soft)] px-3 py-3 font-medium text-warn hover:bg-raised2 sm:flex-none sm:px-4">
              Producto rápido
            </button>
          </div>
          {assocMsg && <div className="mb-2 rounded-lg border border-[color:var(--ok)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-ok">{assocMsg}</div>}
          {assocCode && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm text-warn">
              <span>Asociando código <strong className="font-mono">{assocCode}</strong> — buscá el producto por <strong>nombre</strong> y tocá «Asociar».</span>
              <span className="flex gap-2">
                <a href={`https://www.google.com/search?q=${encodeURIComponent(assocCode)}`} target="_blank" rel="noopener noreferrer" className="rounded border border-hair px-2 py-1 text-xs text-fg-muted hover:text-fg">🔍 Google</a>
                <button type="button" onClick={() => setAssocCode('')} className="rounded border border-hair px-2 py-1 text-xs text-fg-muted hover:text-fg">Cancelar</button>
              </span>
            </div>
          )}
          {!assocCode && /^[a-z0-9-]{6,}$/i.test(search.trim()) && results.length > 0 && !results.some((r) => r.matched && r.matched !== 'nombre' && r.matched !== 'marca') && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hair bg-raised px-3 py-2 text-xs text-fg-muted">
              <span>¿Ninguno es el correcto? Fijá el código y buscá el producto por nombre.</span>
              <button type="button" onClick={() => { setAssocCode(search.trim()); setSearch(''); searchRef.current?.focus(); }} className="rounded-md border border-[color:var(--brand-accent)] px-2.5 py-1 font-semibold text-brand hover:bg-brand-highlight">Asociar {search.trim()} por nombre</button>
            </div>
          )}
          <div ref={resultsRef} data-tour="pos-results" className="min-h-[200px] flex-1 overflow-auto rounded-xl border border-hair-soft bg-surface">
            {loading && <Loader size="sm" label="Productos" />}
            {!loading && results.length > 0 && (
              <><div className="border-b border-hair-soft px-4 py-2 text-right text-xs text-fg-faint"><span className="font-mono tabular-nums">{results.length}</span> {results.length === 1 ? 'resultado' : 'resultados'}</div><ul className="divide-y divide-hair-soft">
                {results.map((p, idx) => {
                  const codeQuery = /^[a-z0-9-]{6,}$/i.test(search.trim());
                  const codeToAssoc = assocCode || (codeQuery ? search.trim() : '');
                  const showAssociate = !!codeToAssoc && (!!assocCode || !p.matched || p.matched === 'nombre');
                  return (
                  <li key={p.id} className="flex items-stretch">
                    <button
                      type="button"
                      data-result-index={idx}
                      onClick={() => addToCart(p)}
                      className={`flex min-h-16 flex-1 items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-raised ${idx === selectedResultIndex ? 'bg-brand-highlight' : ''}`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" />
                        ) : (
                          <span className="h-12 w-12 shrink-0 rounded-lg bg-raised2" />
                        )}
                        <span className="flex flex-col min-w-0">
                          <span className="flex min-w-0 flex-wrap items-center gap-2"><span className="truncate text-[15px] font-semibold text-fg">{highlightedName(p.name, search)}</span>{p.matched && p.matched !== 'nombre' && <span className="rounded-md border border-hair bg-raised2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-fg-muted">{{ codigo: 'Código', sku: 'SKU', ref: 'Ref', bulto: 'Bulto', marca: 'Marca' }[p.matched]}</span>}</span>
                          {p.unitsPerBoxNum != null && p.unitsPerBoxNum >= 2 && (
                            <span className="text-xs text-fg-faint">Bulto × {p.unitsPerBoxNum} u. · vendés por unidad</span>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-col items-end shrink-0 gap-0.5">
                        {idx === selectedResultIndex && <span className="rounded bg-[color:var(--brand-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">↵ Enter</span>}
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted"><span className={`h-2 w-2 rounded-full ${p.stockControl && p.stock <= LOW_STOCK_THRESHOLD ? 'bg-warn' : 'bg-ok'}`} />Stock <span className="font-mono tabular-nums">{p.stock}</span></span>
                        {p.cost != null && Number(p.cost) > 0 && (
                          <span className="font-mono text-xs tabular-nums text-fg-faint">
                            Costo {formatMoneyArs(Number(p.cost))} c/u
                          </span>
                        )}
                        <span className="font-mono text-lg font-bold tabular-nums text-brand">{formatMoneyArs(parseFloat(p.price))} c/u</span>
                      </span>
                    </button>
                    {showAssociate && (
                      <button
                        type="button"
                        onClick={() => void associateCode(p, codeToAssoc)}
                        title={`Asociar el código ${codeToAssoc} a este producto`}
                        className="shrink-0 border-l border-hair-soft px-3 text-center text-[11px] font-semibold text-brand hover:bg-brand-highlight"
                      >
                        ＋ Asociar<br />{codeToAssoc.length > 8 ? 'código' : codeToAssoc}
                      </button>
                    )}
                  </li>
                  );
                })}
              </ul></>
            )}
            {!loading && search.trim() && results.length === 0 && (() => {
              const codeQuery = /^[a-z0-9-]{6,}$/i.test(search.trim());
              const term = search.trim();
              return (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
                  <div>
                    <p className="font-medium text-fg">No encontramos productos{codeQuery ? ' con ese código' : ''}</p>
                    {codeQuery
                      ? <p className="mt-1 text-sm text-fg-faint">Código <span className="font-mono text-fg-muted">{term}</span> — creá un producto nuevo con ese código, o asocialo a uno que ya tengas.</p>
                      : <p className="mt-1 text-sm text-fg-faint">Podés crearlo ahora y agregarlo al carrito.</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button type="button" onClick={() => { if (codeQuery) { setQuickBarcode(term); setQuickName(''); } else { setQuickName(term); setQuickBarcode(''); } setQuickPrice(''); setShowQuickProduct(true); }} className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] px-4 py-2.5 font-medium text-warn hover:bg-raised2">Crear producto rápido</button>
                    {codeQuery && <button type="button" onClick={() => { setAssocCode(term); setSearch(''); searchRef.current?.focus(); }} className="rounded-xl border border-[color:var(--brand-accent)] px-4 py-2.5 font-medium text-brand hover:bg-brand-highlight">Asociar a un producto existente</button>}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-hair-soft bg-surface lg:flex" data-pos-cart>
          <div className="flex justify-between border-b border-hair-soft px-4 py-2.5 font-medium text-fg-muted">
            <span>Carrito</span>
            {discountTotal > 0 && <span className="font-mono tabular-nums text-warn">-${discountTotal.toFixed(0)}</span>}
          </div>
          <div className="flex-1 overflow-auto p-2 min-h-[120px]">
            {cart.length === 0 ? (
              <p className="p-4 text-sm text-fg-faint">Agregá productos con la búsqueda, escaneando código o producto manual.</p>
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
          <div className="space-y-2 border-t border-hair-soft p-4">
            <div className="flex justify-between text-fg-muted">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">${subtotal.toFixed(0)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-warn">
                <span>Descuento (F4)</span>
                <span className="font-mono tabular-nums">-${discountTotal.toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold text-fg">
              <span>Total</span>
              <span className="font-mono text-2xl tabular-nums">${total.toFixed(0)}</span>
            </div>
            {selectedCustomer && (
              <p className="text-amber-400 text-sm">Al fiado: {selectedCustomer.name}</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setShowCustomer(true)}
                data-tour="pos-fiado"
                className={`flex-1 py-3 rounded-lg font-medium ${selectedCustomer ? 'bg-amber-600 text-fg' : 'bg-raised2 text-fg hover:bg-raised2'}`}
              >
                {selectedCustomer ? 'Fiado: ' + selectedCustomer.name : 'Vender al fiado'}
              </button>
              <button
                type="button"
                onClick={() => setShowPaused(true)}
                data-tour="pos-pausar"
                className="flex-1 py-3 rounded-lg bg-raised2 text-fg font-medium hover:bg-raised2"
              >
                Pausar (F6)
              </button>
              <button
                type="button"
                onClick={openPayment}
                disabled={cart.length === 0}
                data-tour="pos-cobrar"
                className="flex-1 py-3 rounded-lg bg-green-600 text-fg font-bold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cobrar (F5)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-hair-soft bg-surface px-3 py-2 shadow-2xl lg:hidden">
        <button type="button" onClick={() => setShowMobileCart(true)} aria-label="Abrir carrito" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-hair bg-raised text-fg"><ShoppingCart className="h-5 w-5" />{cart.length > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-accent)] px-1 font-mono text-[10px] font-bold text-white">{cart.reduce((sum, item) => sum + item.qty, 0)}</span>}</button>
        <div className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-fg-faint">Total</span><strong className="block truncate font-mono text-xl tabular-nums text-fg">${total.toFixed(0)}</strong></div>
        <button type="button" onClick={openPayment} disabled={cart.length === 0} className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white disabled:opacity-50">Cobrar</button>
      </div>

      {showMobileCart && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setShowMobileCart(false)}><div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-hair bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-hair-soft px-4 py-3"><div><h2 className="font-semibold text-fg">Carrito</h2><p className="font-mono text-xs text-fg-faint">{cart.reduce((sum, item) => sum + item.qty, 0)} ítems</p></div><button type="button" onClick={() => setShowMobileCart(false)} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted">Cerrar</button></div><div className="min-h-[120px] flex-1 overflow-y-auto p-3" data-pos-cart>{cart.length === 0 ? <p className="py-8 text-center text-sm text-fg-faint">El carrito está vacío.</p> : <ul className="space-y-2">{cart.map((item) => <CartItemRow key={item.productId} item={item} onMinus={() => updateQty(item.productId, -1)} onPlus={() => updateQty(item.productId, 1)} onQtyChange={(qty) => setItemQty(item.productId, qty)} onPriceChange={(price) => setItemPrice(item.productId, price)} onRemove={() => removeItem(item.productId)} />)}</ul>}</div><div className="space-y-2 border-t border-hair-soft p-4"><div className="flex justify-between text-sm text-fg-muted"><span>Subtotal</span><span className="font-mono tabular-nums">${subtotal.toFixed(0)}</span></div>{discountTotal > 0 && <div className="flex justify-between text-sm text-warn"><span>Descuento</span><span className="font-mono tabular-nums">-${discountTotal.toFixed(0)}</span></div>}<div className="flex justify-between text-xl font-bold text-fg"><span>Total</span><span className="font-mono tabular-nums">${total.toFixed(0)}</span></div>{selectedCustomer && <p className="text-sm text-warn">Al fiado: {selectedCustomer.name}</p>}<div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setShowMobileCart(false); setShowCustomer(true); }} className={`rounded-lg py-3 font-medium ${selectedCustomer ? 'bg-amber-600 text-white' : 'bg-raised2 text-fg'}`}>{selectedCustomer ? `Fiado: ${selectedCustomer.name}` : 'Vender al fiado'}</button><button type="button" onClick={() => { setShowMobileCart(false); setShowPaused(true); }} className="rounded-lg bg-raised2 py-3 font-medium text-fg">Pausar (F6)</button></div></div></div></div>}

      {showOpenCaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setShowOpenCaja(false); pendingPaymentAfterOpenRef.current = false; }}>
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-1">Abrir caja</h2>
            <p className="text-fg-faint text-sm mb-4">Ingresá el efectivo y banco inicial del turno (podés dejar 0).</p>
            <form onSubmit={handleOpenCaja} className="space-y-3">
              <div>
                <label className="block text-xs text-fg-muted mb-1">Efectivo inicial</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={openCajaCash}
                  onChange={(e) => setOpenCajaCash(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted mb-1">Banco inicial (opcional)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={openCajaBank}
                  onChange={(e) => setOpenCajaBank(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={openCajaNotes}
                  onChange={(e) => setOpenCajaNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowOpenCaja(false); pendingPaymentAfterOpenRef.current = false; }}
                  className="flex-1 py-2.5 rounded-lg bg-raised2 text-fg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={openCajaBusy}
                  className="flex-1 py-2.5 rounded-lg btn-brand font-medium disabled:opacity-50"
                >
                  {openCajaBusy ? 'Abriendo…' : 'Abrir turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShortcuts(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-4">Atajos de teclado</h2>
            <ul className="space-y-2 text-fg-muted">
              {SHORTCUTS.map(({ key, desc }) => (
                <li key={key} className="flex justify-between">
                  <kbd className="px-2 py-0.5 rounded bg-raised2 text-brand font-mono text-sm">{key}</kbd>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-fg-faint text-sm">Presioná ? para cerrar</p>
          </div>
        </div>
      )}

      {showDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDiscount(false)}>
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-4">Descuento total (monto)</h2>
            <input
              type="text"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg mb-4"
              onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDiscount(false)} className="flex-1 py-2 rounded-lg bg-raised2 text-fg">Cancelar</button>
              <button type="button" onClick={applyDiscount} className="flex-1 py-2 rounded-lg btn-brand">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <FiscalReceiptModal receipt={receipt} onRefresh={setReceipt} onClose={() => { setReceipt(null); searchRef.current?.focus(); }} />
      )}

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowPayment(false)}>
          <div className={`max-h-[92vh] w-full ${paymentMethodPending === 'efectivo' ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6`} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold text-fg">¿Cómo pagó el cliente?</h2>
            <p className="mb-4 text-sm text-fg-muted">
              Total a cobrar: ${total.toFixed(0)} · Efectivo/Fiado cierra en un paso · Transferencia, MP o tarjeta: elegí método
              (el cliente ve datos en la pantalla) y después «Confirmar cobro» o Enter
            </p>
            {!openCashRegisterId && (
              <div className="mb-4 space-y-2 rounded-lg border border-warn/30 bg-[var(--warn-soft)] p-3 text-sm text-warn">
                <p>No hay caja abierta. Abrí turno antes de cobrar.</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowPayment(false);
                    pendingPaymentAfterOpenRef.current = true;
                    setShowOpenCaja(true);
                  }}
                  className="w-full py-2 rounded-lg bg-amber-600 text-fg font-medium hover:bg-amber-500"
                >
                  Abrir caja desde el POS
                </button>
              </div>
            )}
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PAYMENT_METHODS.map((pm, idx) => (
                <button
                  key={pm.id}
                  type="button"
                  disabled={!openCashRegisterId || cobrandoBusy}
                  onClick={() => pickPaymentMethod(pm.id)}
                  className={`flex items-center gap-2 rounded-lg border border-hair bg-raised px-4 py-3 text-left font-medium text-fg hover-brand-primary disabled:cursor-not-allowed disabled:opacity-40 ${
                    paymentMethodPending === pm.id ? 'ring-2 ring-[color:var(--brand-accent)] ring-offset-2 ring-offset-[color:var(--surface)]' : ''
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-raised2 font-mono text-sm font-bold text-brand">{idx + 1}</span>
                  {pm.label}
                </button>
              ))}
            </div>
            {paymentMethodPending === 'efectivo' && (
              <div className="mb-4 space-y-4 rounded-xl border border-[color:var(--ok)] bg-[var(--ok-soft)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold text-ok">💵 Vuelto — ¿con cuánto pagó?</p>
                  <span className="rounded-lg bg-surface px-3 py-1 text-sm text-fg-muted">Total: <span className="font-mono font-bold text-fg">${total.toLocaleString('es-AR')}</span></span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {(() => {
                    const start = Math.max(1000, Math.ceil(total / 1000) * 1000);
                    const amounts: number[] = [];
                    for (let a = start; a <= 20000; a += 1000) amounts.push(a);
                    if (amounts.length === 0) amounts.push(start); // total ≥ 20.000
                    return amounts.map((a) => (
                      <button key={a} type="button" onClick={() => setCashPaid(a)}
                        className={`rounded-xl border-2 px-2 py-3 text-center transition ${cashPaid === a ? 'border-[color:var(--ok)] bg-surface shadow-sm' : 'border-hair bg-raised hover:border-[color:var(--ok)]'}`}>
                        <span className="block font-mono text-base font-bold text-fg">${a.toLocaleString('es-AR')}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">vuelto <span className="font-mono font-semibold text-ok">${(a - total).toLocaleString('es-AR')}</span></span>
                      </button>
                    ));
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg-muted">Pagó con otro monto:</span>
                  <input type="text" inputMode="numeric" placeholder="$ escribí el monto"
                    value={cashPaid != null ? String(cashPaid) : ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setCashPaid(v ? Number(v) : null); }}
                    className="w-40 rounded-lg border-2 border-hair bg-surface px-3 py-2.5 font-mono text-lg text-fg outline-none focus-brand" />
                </div>
                <div className="rounded-xl bg-surface px-4 py-3 text-center">
                  {cashPaid == null ? (
                    <span className="text-sm text-fg-faint">Elegí un monto o escribilo para ver el vuelto</span>
                  ) : (
                    <>
                      <span className="text-base text-fg-muted">Vuelto a dar: </span>
                      <span className={`font-mono text-3xl font-extrabold ${cashPaid >= total ? 'text-ok' : 'text-crit'}`}>${Math.max(0, cashPaid - total).toLocaleString('es-AR')}</span>
                      {cashPaid < total && <div className="mt-1 text-sm font-semibold text-crit">⚠ Falta ${(total - cashPaid).toLocaleString('es-AR')}</div>}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleCobrar('efectivo')} disabled={cobrandoBusy}
                    className="flex-1 rounded-xl btn-brand py-3.5 text-base font-bold disabled:opacity-50">
                    {cobrandoBusy ? 'Registrando…' : 'Confirmar cobro'}
                  </button>
                  <button type="button" onClick={() => { setPaymentMethodPending(null); setCashPaid(null); }}
                    className="rounded-xl border border-hair px-5 py-3.5 text-sm font-medium text-fg-muted hover:bg-raised">Cambiar</button>
                </div>
              </div>
            )}
            {paymentMethodPending && paymentNeedsCustomerConfirmStep(paymentMethodPending) && (
              <div className="mb-4 space-y-2 rounded-lg border border-ok/30 bg-[var(--ok-soft)] p-3">
                <p className="text-sm text-ok">
                  Pantalla cliente mostrando datos de pago. Cuando el cliente haya pagado, confirmá acá.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmPendingPayment()}
                    disabled={cobrandoBusy}
                    className="flex-1 py-3 rounded-lg btn-brand font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cobrandoBusy ? 'Registrando…' : 'Confirmar cobro'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethodPending(null)}
                    className="rounded-lg border border-hair px-4 py-3 text-sm text-fg-muted hover:bg-raised hover:text-fg"
                  >
                    Cambiar método
                  </button>
                </div>
<button type="button" onClick={()=>void savePaused(paymentMethodPending,'awaiting_payment')} className="w-full rounded-lg border border-warn/40 bg-[var(--warn-soft)] py-3 font-semibold text-warn">Dejar esperando y atender otro</button>
              </div>
            )}
            <button type="button" onClick={() => setShowPayment(false)} className="w-full rounded-lg border border-hair py-2 text-fg-muted hover:bg-raised hover:text-fg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowManual(false)}>
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-4">Producto manual</h2>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nombre"
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg mb-2"
            />
            <input
              type="text"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Precio"
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg mb-4"
              onKeyDown={(e) => e.key === 'Enter' && addManualProduct()}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowManual(false)} className="flex-1 py-2 rounded-lg bg-raised2 text-fg">Cancelar</button>
              <button type="button" onClick={addManualProduct} className="flex-1 py-2 rounded-lg btn-brand">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {showQuickProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !quickBusy && setShowQuickProduct(false)}>
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border border-hair bg-surface p-5 shadow-xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg">Producto rápido</h2>
            <p className="mb-4 mt-1 text-sm text-fg-muted">Se crea como incompleto y sin control de stock.</p>
            <label className="mb-3 block text-sm text-fg-muted">Nombre<input autoFocus type="text" value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder="Nombre del producto" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint focus-brand" /></label>
            <label className="mb-3 block text-sm text-fg-muted">Precio<input type="text" inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} placeholder="0,00" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 font-mono tabular-nums text-fg placeholder:text-fg-faint focus-brand" /></label>
            <label className="mb-5 block text-sm text-fg-muted">SKU / código de barras <span className="text-fg-faint">(opcional)</span><input type="text" value={quickBarcode} onChange={(event) => setQuickBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createQuickProduct(); }} placeholder="Código escaneable" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-fg placeholder:text-fg-faint focus-brand" /></label>
            <div className="flex gap-2"><button type="button" disabled={quickBusy} onClick={() => setShowQuickProduct(false)} className="flex-1 rounded-lg border border-hair bg-raised py-2 text-fg-muted hover:bg-raised2 disabled:opacity-50">Cancelar</button><button type="button" disabled={quickBusy} onClick={() => void createQuickProduct()} className="btn-brand flex-1 rounded-lg py-2 font-medium disabled:opacity-50">{quickBusy ? 'Creando…' : 'Crear y agregar'}</button></div>
          </div>
        </div>
      )}

      {showSeller && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !sellerBusy && setShowSeller(false)}><div className="w-full max-w-sm rounded-xl border border-hair bg-surface p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><h2 className="text-lg font-bold text-fg">Cambiar vendedor</h2><p className="mb-4 mt-1 text-sm text-fg-muted">Elegí quién operará las próximas ventas.</p><div className="space-y-2">{sellers.filter((seller) => seller.active).map((seller) => <button key={seller.id} type="button" disabled={sellerBusy || seller.id === activeSeller?.id} onClick={() => void changeSeller(seller)} className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${seller.id === activeSeller?.id ? 'border-[color:var(--brand-accent)] bg-brand-highlight text-brand' : 'border-hair bg-raised text-fg hover:bg-raised2'} disabled:opacity-60`}><span className="font-medium">{seller.name}</span>{seller.id === activeSeller?.id && <span className="text-xs">Activo</span>}</button>)}</div><button type="button" disabled={sellerBusy} onClick={() => setShowSeller(false)} className="mt-4 w-full rounded-lg border border-hair py-2 text-fg-muted hover:bg-raised">Cerrar</button></div></div>}

      {showPaused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowPaused(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-4">Ventas en espera</h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={()=>void savePaused()}
                className="w-full py-2 rounded-lg btn-brand mb-4"
              >
                Guardar venta actual en espera
              </button>
            )}
            {pausedList.length === 0 ? (
              <p className="text-fg-faint text-sm">No hay ventas pausadas.</p>
            ) : (
              <ul className="space-y-2">
                {pausedList.map((p) => (
                  <li key={p.id} className="flex justify-between items-center gap-2 p-2 rounded bg-raised">
                    <span className="text-fg-muted text-sm truncate">
                      {(p.payload?.items as CartItem[])?.length || 0} ítems · {new Date(p.createdAt).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={()=>void restorePaused(p)}
                      className="px-3 py-1 rounded btn-brand text-sm"
                    >
                      Retomar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setShowPaused(false)} className="mt-4 w-full py-2 rounded-lg border border-hair text-fg-muted">Cerrar</button>
          </div>
        </div>
      )}

      {showCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCustomer(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-hair bg-surface p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-fg mb-4">Vender al fiado</h2>
            <button
              type="button"
              onClick={() => { setSelectedCustomer(null); setShowCustomer(false); }}
              className="w-full py-2 rounded-lg bg-raised2 text-fg mb-2"
            >
              Cobro normal (sin fiado)
            </button>
            <ul className="space-y-2">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomer({ id: c.id, name: c.name }); setShowCustomer(false); }}
                    className="w-full text-left px-4 py-2 rounded bg-raised hover:bg-raised2 text-fg"
                  >
                    {c.name} {Number(c.balance) > 0 && <span className="text-amber-400 text-sm">(saldo: ${Number(c.balance).toFixed(0)})</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setShowCustomer(false)} className="mt-4 w-full py-2 rounded-lg border border-hair text-fg-muted">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
