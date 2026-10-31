'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

function formatMoneyArs(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function parsePriceDraft(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

type Props = {
  productId: string;
  price: string | number;
  enabled: boolean;
  className?: string;
  /** Clases del input cuando se edita. */
  inputClassName?: string;
  onSaved?: (productId: string, price: number) => void;
};

/**
 * Precio de venta: en modo edición rápida se toca y se escribe el valor exacto
 * (sin redondeo a $500). Pensado para celular y desktop (Teatro).
 */
export function QuickPriceEdit({
  productId,
  price,
  enabled,
  className = '',
  inputClassName = '',
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = Number(price);

  useEffect(() => {
    if (!editing) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [editing]);

  useEffect(() => {
    if (!enabled) setEditing(false);
  }, [enabled]);

  const commit = async () => {
    const next = parsePriceDraft(draft);
    if (next == null) {
      setEditing(false);
      return;
    }
    if (next === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api(`/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ price: next }),
      });
      onSaved?.(productId, next);
      setEditing(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo guardar el precio');
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) {
    return <span className={className}>{formatMoneyArs(current)}</span>;
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-center gap-1"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="text-fg-faint">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          disabled={saving}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
            }
          }}
          className={
            inputClassName ||
            'w-24 min-h-11 rounded-lg border border-[color:var(--brand-accent)] bg-surface px-2 py-1.5 font-mono text-base font-bold tabular-nums text-brand outline-none'
          }
          aria-label="Precio de venta"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      title="Tocá para editar el precio"
      className={`${className} rounded-md underline decoration-dotted decoration-brand/60 underline-offset-4 hover:bg-brand-highlight/40`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraft(Number.isFinite(current) ? String(Math.round(current)) : '');
        setEditing(true);
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {formatMoneyArs(current)}
    </button>
  );
}
