/** Paleta y clases compartidas — álbum figuritas (rojo Mundial) */
export const fig = {
  pageBg: 'min-h-screen bg-[#0c0606] text-slate-100',
  pageGlow:
    'fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_12%_0%,rgba(220,38,38,0.14),transparent_52%),radial-gradient(ellipse_at_88%_100%,rgba(127,29,29,0.18),transparent_48%)]',

  hero: 'relative overflow-hidden rounded-2xl sm:rounded-3xl border border-red-400/20 bg-gradient-to-br from-[#5c0a0a] via-[#991b1b] to-[#3b0707] text-white shadow-2xl shadow-red-950/40',
  heroGlowA: 'absolute -top-20 -right-16 w-56 sm:w-72 h-56 sm:h-72 rounded-full bg-red-300/10 blur-3xl',
  heroGlowB: 'absolute -bottom-12 -left-12 w-40 sm:w-56 h-40 sm:h-56 rounded-full bg-rose-400/10 blur-2xl',

  badge: 'text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-red-200/90',
  accent: 'text-red-200',
  accentStrong: 'text-white',
  statNum: 'text-xl sm:text-2xl font-black text-white',
  statLabel: 'text-[9px] sm:text-[10px] uppercase tracking-wide text-red-100/60',

  btnPrimary:
    'px-5 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-sm shadow-lg shadow-red-900/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary:
    'px-4 py-2 rounded-xl bg-red-950/60 border border-red-800/60 hover:bg-red-900/50 text-red-100 text-sm font-medium transition-colors disabled:opacity-50',
  btnGhost:
    'px-4 py-2 rounded-xl border border-red-900/50 hover:border-red-700/60 hover:bg-red-950/40 text-sm text-red-200/90 transition-colors disabled:opacity-50',

  card: 'rounded-2xl border border-red-900/40 bg-gradient-to-b from-red-950/30 to-[#0c0606]/80 backdrop-blur-sm shadow-lg',
  cardInner: 'rounded-xl bg-black/25 border border-white/5',

  input:
    'w-full bg-red-950/40 border border-red-800/50 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm text-white placeholder:text-red-200/30 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50',
  inputSm:
    'bg-red-950/50 border border-red-800/50 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30',

  msgInfo: 'rounded-xl bg-red-950/50 border border-red-700/40 text-red-100 text-sm px-4 py-2.5',
  msgError: 'rounded-xl bg-red-950/60 border border-red-600/50 text-red-200 text-sm px-4 py-3',

  tabActive: 'bg-red-600 text-white shadow-md shadow-red-900/30',
  tabIdle: 'bg-red-950/40 text-red-200/70 hover:bg-red-900/40 hover:text-red-100 border border-red-900/30',

  pickerActive:
    'border-red-400 bg-red-500/15 shadow-[0_0_14px_rgba(248,113,113,0.25)] scale-[1.02]',
  pickerIdle: 'border-red-900/60 bg-red-950/30 hover:border-red-700/70',

  albumHeader:
    'relative bg-gradient-to-r from-[#5c0a0a] via-[#991b1b] to-[#5c0a0a] px-3 py-4 sm:px-6 sm:py-5',
  albumSheet:
    'bg-[#faf5f0] dark:bg-[#1a1210] p-3 sm:p-5 md:p-6 bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.06),transparent_60%)]',
  albumBorder: 'rounded-xl sm:rounded-2xl overflow-hidden border border-red-900/40 shadow-xl shadow-red-950/20',

  progressTrack: 'h-1.5 sm:h-2 rounded-full bg-black/35 overflow-hidden',
  progressFill: 'h-full rounded-full bg-gradient-to-r from-red-600 via-red-400 to-rose-300 transition-all duration-500',

  slotAvailable:
    'border-red-400/80 bg-gradient-to-b from-red-900/50 via-[#1a0a0a] to-[#0c0606] shadow-md hover:shadow-[0_0_18px_rgba(239,68,68,0.25)] hover:scale-[1.04] active:scale-95 cursor-pointer',
  slotInCart:
    'border-red-300 bg-gradient-to-b from-red-800/70 via-[#1a0a0a] to-[#0c0606] shadow-[0_0_22px_rgba(248,113,113,0.3)] scale-[1.02]',
  slotAdminAvail:
    'border-red-500/60 bg-gradient-to-b from-red-950/90 to-[#0c0606] shadow-[0_2px_8px_rgba(220,38,38,0.2)]',
} as const;
