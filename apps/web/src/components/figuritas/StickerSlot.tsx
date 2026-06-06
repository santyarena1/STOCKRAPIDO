'use client';

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
        className={`group relative aspect-[3/4] rounded-lg border-2 p-1 flex flex-col items-center justify-between transition-all ${
          available
            ? 'border-emerald-500/60 bg-gradient-to-b from-emerald-950/80 to-slate-900 shadow-[0_2px_8px_rgba(16,185,129,0.15)]'
            : 'border-slate-700/80 bg-slate-900/80 opacity-70'
        }`}
      >
        <span className="text-[10px] font-bold text-amber-400/90 tracking-wider">FIG.</span>
        <span className="text-lg font-black text-white tabular-nums">{number}</span>
        <input
          type="number"
          min={0}
          value={stock}
          onChange={(e) => props.onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full text-center bg-slate-800 border border-slate-600 rounded text-xs py-0.5 text-emerald-300 font-bold"
        />
        <button
          type="button"
          onClick={props.onQuickAdd}
          className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 w-6 h-6 rounded-full bg-sky-500 text-white text-sm font-bold shadow-lg transition-opacity"
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
  const maxed = available && inCart >= stock;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => (canAdd ? onAdd() : inCart > 0 && onRemove ? onRemove() : undefined)}
      className={`relative aspect-[3/4] rounded-xl border-2 p-1.5 flex flex-col items-center justify-between transition-all duration-200 ${
        soldOut
          ? 'border-slate-700/50 bg-slate-900/60 cursor-not-allowed grayscale'
          : inCart > 0
            ? 'border-amber-400 bg-gradient-to-b from-amber-950/90 via-slate-900 to-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.25)] scale-[1.02]'
            : canAdd
              ? 'border-amber-500/70 bg-gradient-to-b from-amber-900/40 via-slate-900 to-slate-950 shadow-md hover:shadow-[0_0_16px_rgba(251,191,36,0.2)] hover:scale-[1.04] active:scale-95 cursor-pointer'
              : 'border-slate-600 bg-slate-900/80 opacity-60 cursor-not-allowed'
      }`}
    >
      {/* Brillo tipo foil */}
      {!soldOut && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
      )}

      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-500/80 z-10">
        {soldOut ? '—' : 'fig.'}
      </span>

      <span
        className={`text-xl sm:text-2xl font-black tabular-nums z-10 ${
          soldOut ? 'text-slate-600' : 'text-white drop-shadow'
        }`}
      >
        {number}
      </span>

      <div className="z-10 w-full text-center">
        {soldOut ? (
          <span className="text-[9px] font-medium text-slate-500 uppercase">Agotada</span>
        ) : (
          <>
            <span className="block text-[10px] font-semibold text-emerald-400">
              {stock - inCart} disp.
            </span>
            {price != null && price > 0 && (
              <span className="block text-[9px] text-slate-400">{formatFiguritasMoney(price)}</span>
            )}
          </>
        )}
      </div>

      {inCart > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center shadow-lg z-20">
          {inCart}
        </span>
      )}
    </button>
  );
}
