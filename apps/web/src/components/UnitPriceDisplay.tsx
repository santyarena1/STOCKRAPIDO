'use client';

import { decorateProductUnitsClient, formatMoneyArs } from '@/lib/units';

type Props = {
  cost?: unknown;
  price?: unknown;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBox?: number | null;
  priceBox?: number | null;
  /** mostrar costo unitario (POS, sync) */
  showCost?: boolean;
  /** mostrar precio venta (default true) */
  showPrice?: boolean;
  /** mostrar referencia de bulto (solo uso interno) */
  showBulkInternal?: boolean;
  /** alineación de la columna */
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
};

export function UnitPriceDisplay({
  cost,
  price,
  unitsPerBox,
  unitsPerBoxNum,
  costBox,
  priceBox,
  showCost = false,
  showPrice = true,
  showBulkInternal = false,
  align = 'right',
  size = 'sm',
}: Props) {
  const u = decorateProductUnitsClient({ cost, price, unitsPerBox, unitsPerBoxNum, costBox, priceBox });
  const textMain = size === 'md' ? 'text-base' : 'text-sm';
  const textSub = size === 'md' ? 'text-xs' : 'text-[11px]';

  return (
    <div className={`flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {showCost && u.costNum != null && (
        <span className={`${textSub} text-slate-500`}>
          Costo {formatMoneyArs(u.costNum)} <span className="text-slate-600">c/u</span>
        </span>
      )}
      {showPrice && u.priceNum != null && (
        <span className={`${textMain} font-medium text-slate-200`}>
          {formatMoneyArs(u.priceNum)}{' '}
          <span className={`${textSub} font-normal text-slate-500`}>c/u</span>
        </span>
      )}
      {u.isBulk && !showBulkInternal && (
        <span className={`${textSub} text-violet-400/70`}>× {u.unitsPerBoxNum} un./bulto</span>
      )}
      {showBulkInternal && u.isBulk && (
        <span className={`${textSub} text-slate-600 border-t border-slate-700/60 pt-0.5 mt-0.5`}>
          Interno bulto:{' '}
          {u.costBox != null && <span>costo {formatMoneyArs(u.costBox)}</span>}
          {u.costBox != null && u.priceBox != null && ' · '}
          {u.priceBox != null && <span>venta {formatMoneyArs(u.priceBox)}</span>}
        </span>
      )}
    </div>
  );
}
