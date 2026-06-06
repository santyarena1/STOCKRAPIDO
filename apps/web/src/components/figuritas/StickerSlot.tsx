'use client';

import { fig } from './theme';
import { formatFiguritasMoney } from '@/lib/figuritas';

type PublicProps = {
  mode: 'public';
  number: number;
  stock: number;
  inCart: number;
  price?: number;
  onAdd: () => void;
  onRemove?: () => void;
};

type AdminProps = {
  mode: 'admin';
  number: number;
  stock: number;
  onChange: (stock: number) => void;
  onQuickAdd?: () => void;
};

export function StickerSlot(props: PublicProps | AdminProps) {
  const { number, stock } = props;
  const available = stock > 0;

  if (props.mode === 'admin') {
    return (
      <div
        className={`group relative aspect-[3/4] rounded-lg border-2 p-0.5 sm:p-1 flex flex-col items-center justify-between transition-all touch-manipulation ${
          available ? fig.slotAdminAvail : 'border-red-950/80 bg-red-950/20 opacity-60'
        }`}
      >
        <span className="text-[8px] sm:text-[10px] font-bold text-red-300/80 tracking-wider">FIG.</span>
        <span className="text-base sm:text-lg font-black text-white tabular-nums">{number}</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={stock}
          onChange={(e) => props.onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full text-center bg-red-950/80 border border-red-800/50 rounded text-[10px] sm:text-xs py-0.5 text-red-200 font-bold"
        />
        <button
          type="button"
          onClick={props.onQuickAdd}
          className="sm:opacity-0 sm:group-hover:opacity-100 absolute -top-1.5 -right-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-red-500 text-white text-xs font-bold shadow-lg transition-opacity"
          title="+1 repetida"
        >
          +
        </button>
      </div>
    );
  }

  const { inCart, price, onAdd, onRemove } = props;
  const canAdd = available && inCart < stock;
  const soldOut = !available;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => (canAdd ? onAdd() : inCart > 0 && onRemove ? onRemove() : undefined)}
      className={`relative aspect-[3/4] rounded-lg sm:rounded-xl border-2 p-1 sm:p-1.5 flex flex-col items-center justify-between transition-all duration-200 touch-manipulation ${
        soldOut
          ? 'border-red-950/40 bg-red-950/20 cursor-not-allowed grayscale opacity-50'
          : inCart > 0
            ? fig.slotInCart
            : canAdd
              ? fig.slotAvailable
              : 'border-red-900/50 bg-red-950/30 opacity-60 cursor-not-allowed'
      }`}
    >
      {!soldOut && (
        <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
      )}

      <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.12em] text-red-300/70 z-10">
        {soldOut ? '—' : 'fig.'}
      </span>

      <span
        className={`text-lg sm:text-xl md:text-2xl font-black tabular-nums z-10 ${
          soldOut ? 'text-red-900/40' : 'text-white drop-shadow'
        }`}
      >
        {number}
      </span>

      <div className="z-10 w-full text-center">
        {soldOut ? (
          <span className="text-[8px] sm:text-[9px] font-medium text-red-900/50 uppercase">Agotada</span>
        ) : (
          <>
            <span className="block text-[9px] sm:text-[10px] font-semibold text-red-300">
              {stock - inCart} disp.
            </span>
            {price != null && price > 0 && (
              <span className="block text-[8px] sm:text-[9px] text-red-200/50 sm:block">
                {formatFiguritasMoney(price)}
              </span>
            )}
          </>
        )}
      </div>

      {inCart > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-full bg-white text-red-700 text-[10px] sm:text-xs font-black flex items-center justify-center shadow-lg z-20">
          {inCart}
        </span>
      )}
    </button>
  );
}
