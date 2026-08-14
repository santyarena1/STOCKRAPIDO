'use client';

import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type Direction = 'in' | 'out';

type ScanResult =
  | { found: true; product: { id: string; name: string; stock: number; barcode?: string | null; imageUrl?: string | null }; qty: number }
  | { found: false; code: string };

type Row = {
  productId: string;
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  delta: number; // neto de esta sesión (+/-)
  stock: number; // stock actual tras el último movimiento
  ts: number;
};

type UnknownCode = { code: string; count: number; ts: number };

type Move = {
  id: string;
  qty: number;
  reason: string;
  createdAt: string;
  product: { name: string; barcode?: string | null };
};

// Beep corto para feedback de escaneo (sin dependencias).
function beep(kind: 'ok' | 'err') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'ok' ? 880 : 220;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === 'ok' ? 0.07 : 0.18));
    osc.onended = () => ctx.close();
  } catch {
    /* audio no disponible */
  }
}

export default function StockRapidoPage() {
  const [direction, setDirection] = useState<Direction>('in');
  const [scan, setScan] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [unknowns, setUnknowns] = useState<UnknownCode[]>([]);
  const [pending, setPending] = useState(0);
  const [flash, setFlash] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [moves, setMoves] = useState<Move[]>([]);
  const [movesLoading, setMovesLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const directionRef = useRef<Direction>('in');
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { directionRef.current = direction; }, [direction]);

  // Mantener el foco en el input para el lector.
  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => { focusInput(); }, [focusInput]);

  const showFlash = useCallback((text: string, kind: 'ok' | 'err') => {
    setFlash({ text, kind });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
  }, []);

  const applyResult = useCallback((res: ScanResult, dir: Direction) => {
    if (res.found) {
      const p = res.product;
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.productId === p.id);
        const now = Date.now();
        if (idx >= 0) {
          const updated: Row = { ...prev[idx], delta: prev[idx].delta + res.qty, stock: p.stock, ts: now };
          return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }
        return [{ productId: p.id, name: p.name, barcode: p.barcode, imageUrl: p.imageUrl, delta: res.qty, stock: p.stock, ts: now }, ...prev];
      });
      beep('ok');
      showFlash(`${dir === 'in' ? '+1' : '−1'} ${p.name} · stock ${p.stock}`, 'ok');
    } else {
      setUnknowns((prev) => {
        const idx = prev.findIndex((u) => u.code === res.code);
        if (idx >= 0) {
          const updated = { ...prev[idx], count: prev[idx].count + 1, ts: Date.now() };
          return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }
        return [{ code: res.code, count: 1, ts: Date.now() }, ...prev];
      });
      beep('err');
      showFlash(`Código sin coincidencia: ${res.code}`, 'err');
    }
  }, [showFlash]);

  // Procesa la cola de escaneos de forma serializada (soporta escaneos rápidos sin perder ninguno).
  const drain = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    while (queueRef.current.length > 0) {
      const code = queueRef.current.shift()!;
      const dir = directionRef.current;
      try {
        const res = await api<ScanResult>('/products/scan-move', {
          method: 'POST',
          body: JSON.stringify({ code, direction: dir }),
        });
        applyResult(res, dir);
      } catch {
        beep('err');
        showFlash(`Error al registrar «${code}»`, 'err');
      } finally {
        setPending(queueRef.current.length);
      }
    }
    processingRef.current = false;
  }, [applyResult, showFlash]);

  const enqueue = useCallback((code: string) => {
    const c = code.trim();
    if (!c) return;
    queueRef.current.push(c);
    setPending(queueRef.current.length);
    void drain();
  }, [drain]);

  const onScanKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      enqueue(scan);
      setScan('');
    }
  }, [enqueue, scan]);

  const openHistory = useCallback(() => {
    setShowHistory(true);
    setMovesLoading(true);
    api<Move[]>('/products/stock-moves', { params: { kind: 'escaneo', limit: '150' } })
      .then((data) => setMoves(Array.isArray(data) ? data : []))
      .catch(() => setMoves([]))
      .finally(() => setMovesLoading(false));
  }, []);

  const clearSession = useCallback(() => {
    setRows([]);
    setUnknowns([]);
    focusInput();
  }, [focusInput]);

  const totalUnidades = rows.reduce((sum, r) => sum + Math.abs(r.delta), 0);
  const totalNeto = rows.reduce((sum, r) => sum + r.delta, 0);

  const isIn = direction === 'in';

  return (
    <Container>
      <PageHeader
        title="Stock rápido"
        subtitle="Escaneá para sumar (Ingreso) o restar (Egreso) stock. Soporta escaneos rápidos."
        actions={
          <button
            type="button"
            onClick={openHistory}
            className="rounded-lg border border-hair bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-raised"
          >
            🕑 Historial
          </button>
        }
      />

      {/* Selector de modo */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { setDirection('in'); focusInput(); }}
          className={`rounded-2xl border-2 px-4 py-5 text-center transition ${
            isIn
              ? 'border-[color:var(--ok)] bg-[var(--ok-soft)] text-ok shadow-sm'
              : 'border-hair bg-surface text-fg-muted hover:bg-raised'
          }`}
        >
          <div className="text-2xl font-bold">＋ Ingreso</div>
          <div className="text-xs opacity-80">Suma 1 al stock por escaneo</div>
        </button>
        <button
          type="button"
          onClick={() => { setDirection('out'); focusInput(); }}
          className={`rounded-2xl border-2 px-4 py-5 text-center transition ${
            !isIn
              ? 'border-[color:var(--crit)] bg-[var(--crit-soft)] text-crit shadow-sm'
              : 'border-hair bg-surface text-fg-muted hover:bg-raised'
          }`}
        >
          <div className="text-2xl font-bold">－ Egreso</div>
          <div className="text-xs opacity-80">Resta 1 al stock por escaneo</div>
        </button>
      </div>

      {/* Input de escaneo */}
      <div
        className={`mb-4 rounded-2xl border-2 p-4 ${
          isIn ? 'border-[color:var(--ok)]/40' : 'border-[color:var(--crit)]/40'
        } bg-surface`}
        onClick={focusInput}
      >
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-faint">
          {isIn ? 'Modo INGRESO' : 'Modo EGRESO'} · escaneá o escribí el código y Enter
        </label>
        <input
          ref={inputRef}
          type="text"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={onScanKey}
          onBlur={() => setTimeout(focusInput, 60)}
          autoFocus
          inputMode="numeric"
          placeholder="Escaneá un producto…"
          className="w-full bg-transparent font-mono text-2xl text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-fg-faint">
          <span>{pending > 0 ? `Procesando ${pending}…` : 'Listo para escanear'}</span>
          {flash && (
            <span className={`rounded px-2 py-0.5 font-medium ${flash.kind === 'ok' ? 'bg-[var(--ok-soft)] text-ok' : 'bg-[var(--crit-soft)] text-crit'}`}>
              {flash.text}
            </span>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-lg bg-raised px-3 py-1.5 text-fg-muted">
          Productos: <strong className="text-fg tabular-nums">{rows.length}</strong>
        </span>
        <span className="rounded-lg bg-raised px-3 py-1.5 text-fg-muted">
          Escaneos: <strong className="text-fg tabular-nums">{totalUnidades}</strong>
        </span>
        <span className="rounded-lg bg-raised px-3 py-1.5 text-fg-muted">
          Neto: <strong className={`tabular-nums ${totalNeto >= 0 ? 'text-ok' : 'text-crit'}`}>{totalNeto >= 0 ? '+' : ''}{totalNeto}</strong>
        </span>
        {(rows.length > 0 || unknowns.length > 0) && (
          <button type="button" onClick={clearSession} className="ml-auto rounded-lg border border-hair px-3 py-1.5 text-fg-muted hover:bg-raised">
            Limpiar sesión
          </button>
        )}
      </div>

      {/* Códigos sin coincidencia */}
      {unknowns.length > 0 && (
        <div className="mb-4 rounded-xl border border-[color:var(--crit)]/30 bg-[var(--crit-soft)] p-3">
          <div className="mb-1 text-xs font-semibold uppercase text-crit">Sin coincidencia exacta ({unknowns.length})</div>
          <div className="flex flex-wrap gap-2">
            {unknowns.map((u) => (
              <span key={u.code} className="rounded-md border border-[color:var(--crit)]/40 bg-surface px-2 py-1 font-mono text-xs text-crit">
                {u.code}{u.count > 1 && <span className="ml-1 opacity-70">×{u.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista viva */}
      <div className="rounded-2xl border border-hair-soft bg-surface">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-fg-faint">
            Todavía no escaneaste nada. Elegí <strong>{isIn ? 'Ingreso' : 'Egreso'}</strong> y empezá a escanear.
          </div>
        ) : (
          <ul className="divide-y divide-hair-soft">
            {rows.map((r) => (
              <li key={r.productId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain" />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-lg bg-raised2" />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-fg">{r.name}</span>
                    {r.barcode && <span className="font-mono text-xs text-fg-faint">{r.barcode}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <span className={`rounded-lg px-2.5 py-1 text-lg font-bold tabular-nums ${r.delta >= 0 ? 'bg-[var(--ok-soft)] text-ok' : 'bg-[var(--crit-soft)] text-crit'}`}>
                    {r.delta >= 0 ? '+' : ''}{r.delta}
                  </span>
                  <span className="text-right text-xs text-fg-muted">
                    Stock<br /><strong className="font-mono text-base tabular-nums text-fg">{r.stock}</strong>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal de historial */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowHistory(false)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-hair-soft px-4 py-3">
              <h2 className="text-lg font-semibold text-fg">Historial de escaneos</h2>
              <button type="button" onClick={() => setShowHistory(false)} className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised">✕</button>
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto">
              {movesLoading ? (
                <Loader size="sm" label="Historial" />
              ) : moves.length === 0 ? (
                <div className="p-10 text-center text-sm text-fg-faint">Todavía no hay movimientos por escaneo.</div>
              ) : (
                <ul className="divide-y divide-hair-soft">
                  {moves.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{m.product?.name ?? 'Producto'}</span>
                        <span className="text-xs text-fg-faint">
                          {m.reason === 'ingreso_escaneo' ? 'Ingreso' : 'Egreso'} · {new Date(m.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${m.qty >= 0 ? 'bg-[var(--ok-soft)] text-ok' : 'bg-[var(--crit-soft)] text-crit'}`}>
                        {m.qty >= 0 ? '+' : ''}{m.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
