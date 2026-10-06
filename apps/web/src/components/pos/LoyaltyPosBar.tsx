'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { arsCentsToPurchasedPoints, maxRedeemablePoints, pointsToCents } from '@/lib/loyalty-money';

export type LoyaltyAttachment = {
  id: string;
  name: string;
  balancePoints: number;
  arsLabel: string;
  checkInId?: string | null;
  hint?: string | null;
};

type Checkin = {
  id: string;
  accountId: string;
  name: string;
  hint?: string | null;
  createdAt: string;
  balancePoints: number;
  arsLabel: string;
};
type PosContext = { enabled: false } | { enabled: true; pointsPerArs: number; cashbackPercent: number };

function ago(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'hace 1 min' : `hace ${minutes} min`;
}

export function LoyaltyPosBar({
  total,
  attachment,
  pointsToRedeem,
  onAttachment,
  onPoints,
  onPayWithPoints,
}: {
  total: number;
  attachment: LoyaltyAttachment | null;
  pointsToRedeem: number;
  onAttachment: (value: LoyaltyAttachment | null) => void;
  onPoints: (points: number) => void;
  onPayWithPoints?: (points: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<Checkin[]>([]);
  const [context, setContext] = useState<PosContext>({ enabled: false });
  const [card, setCard] = useState('');
  const [custom, setCustom] = useState('');
  const [pesos, setPesos] = useState('');
  const [earn, setEarn] = useState(0);

  useEffect(() => {
    api<PosContext>('/loyalty/pos').then(setContext).catch(() => setContext({ enabled: false }));
  }, []);

  useEffect(() => {
    if (!context.enabled) return;
    let stop = false;
    const tick = () => {
      api<Checkin[]>('/loyalty/checkins')
        .then((rows) => { if (!stop) setQueue(rows); })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [context.enabled]);

  useEffect(() => {
    if (!context.enabled || !attachment) {
      setEarn(0);
      return;
    }
    const timer = window.setTimeout(() => {
      api<{ earnedPoints: number }>('/loyalty/preview', {
        method: 'POST',
        body: JSON.stringify({ accountId: attachment.id, total, points: pointsToRedeem }),
      })
        .then((row) => setEarn(row.earnedPoints))
        .catch(() => setEarn(0));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [attachment, context.enabled, pointsToRedeem, total]);

  if (!context.enabled) return null;
  const rate = context.pointsPerArs;
  const saleCents = Math.round(Math.max(0, total) * 100);
  const maxPoints = attachment ? maxRedeemablePoints(saleCents, attachment.balancePoints, rate) : 0;
  const coversAll = saleCents > 0 && pointsToCents(maxPoints, rate) >= saleCents;

  return (
    <div className="border-b border-hair-soft px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-left text-sm font-medium text-fg">
          Clientes esperando puntos ({queue.length})
        </button>
        {attachment ? (
          <span className="truncate text-sm text-brand">✓ Puntos para {attachment.name}</span>
        ) : (
          <span className="text-xs text-fg-faint">Sin cliente de puntos</span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1">
          {queue.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                onAttachment({ id: row.accountId, name: row.name, balancePoints: row.balancePoints, arsLabel: row.arsLabel, checkInId: row.id, hint: row.hint });
                onPoints(0);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg bg-raised px-3 py-2 text-left text-sm"
            >
              <span>🟢 {row.name}{row.hint ? ` · ${row.hint}` : ''}</span>
              <span className="text-fg-faint">{ago(row.createdAt)}</span>
            </button>
          ))}
          {!queue.length && <p className="text-xs text-fg-faint">Nadie en la fila.</p>}
          <form
            className="flex gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              void api<LoyaltyAttachment>('/loyalty/cards/lookup', { method: 'POST', body: JSON.stringify({ token: card.trim() }) })
                .then((found) => {
                  onAttachment({ ...found, checkInId: null });
                  onPoints(0);
                  setCard('');
                })
                .catch((error) => alert(error instanceof Error ? error.message : 'Tarjeta no encontrada'));
            }}
          >
            <input value={card} onChange={(event) => setCard(event.target.value)} placeholder="Escanear tarjeta de fidelidad" className="w-full rounded-lg border border-hair bg-app px-3 py-2 text-sm" />
          </form>
        </div>
      )}
      {attachment && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>⭐ {attachment.name} · {attachment.balancePoints.toLocaleString('es-AR')} pts ({attachment.arsLabel})</span>
          <button type="button" className="text-brand" onClick={() => onPoints(maxPoints)}>Usar puntos</button>
          {coversAll && onPayWithPoints && (
            <button type="button" className="rounded-lg bg-brand-highlight px-2 py-1 text-sm font-semibold text-brand" onClick={() => onPayWithPoints(maxPoints)}>
              Cobrar con puntos
            </button>
          )}
          <button type="button" className="text-fg-faint" onClick={() => { onAttachment(null); onPoints(0); }}>Quitar</button>
          {pointsToRedeem > 0 && <span className="text-fg-muted">Usa {pointsToRedeem.toLocaleString('es-AR')} pts</span>}
          {earn > 0 && <span className="text-fg-muted">Ganará aprox. {earn.toLocaleString('es-AR')} pts</span>}
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onBlur={() => {
              const points = Math.max(0, Math.trunc(Number(custom) || 0));
              onPoints(Math.min(points, maxPoints));
            }}
            placeholder="Puntos"
            inputMode="numeric"
            className="w-24 rounded border border-hair bg-app px-2 py-1 text-sm"
          />
          <input
            value={pesos}
            onChange={(event) => setPesos(event.target.value)}
            onBlur={() => {
              const cents = Math.round((Number(pesos.replace(',', '.')) || 0) * 100);
              onPoints(Math.min(arsCentsToPurchasedPoints(cents, rate), maxPoints));
            }}
            placeholder="Pesos"
            inputMode="decimal"
            className="w-24 rounded border border-hair bg-app px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}
