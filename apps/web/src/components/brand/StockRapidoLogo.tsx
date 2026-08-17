import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Bolsa con S — misma marca en landing, sistema y favicon. */
export function StockRapidoBag({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      className={cn('shrink-0 bg-transparent', className)}
      style={{ background: 'transparent' }}
      aria-hidden
      focusable="false"
    >
      <g transform="rotate(7 64 64)">
        <path
          fill="#E31C23"
          d="M28 26.2 32.5 21 37 26.2 41.5 21 46 26.2 50.5 21 55 26.2 59.5 21 64 26.2 68.5 21 73 26.2 77.5 21 82 26.2 86.5 21 91 26.2 95.5 21 100 26.2
             Q108 64 100 101.8
             L95.5 107 91 101.8 86.5 107 82 101.8 77.5 107 73 101.8 68.5 107 64 101.8 59.5 107 55 101.8 50.5 107 46 101.8 41.5 107 37 101.8 32.5 107 28 101.8
             Q20 64 28 26.2 Z"
        />
        <text
          x="64"
          y="68"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontFamily="Arial Black, Arial, Helvetica, sans-serif"
          fontSize="52"
          fontWeight="800"
        >
          S
        </text>
      </g>
    </svg>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold tracking-tight', className)}>
      <span>STOCK</span>
      <span className="text-[#E31C23]">RAPIDO</span>
    </span>
  );
}

type Props = {
  variant?: 'landing' | 'header' | 'system' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  href?: string | null;
  className?: string;
};

const BAG = { sm: 'h-11 w-11', md: 'h-[72px] w-[72px]', lg: 'h-24 w-24' } as const;
const WORD = { sm: 'text-[15px]', md: 'text-[18px]', lg: 'text-[22px]' } as const;

export function StockRapidoLogo({ variant = 'system', size = 'md', href = '/', className }: Props) {
  const slogan = (
    <span className="block text-[10px] font-semibold tracking-wide text-[var(--mk-ink-3)] sm:text-[11px]">
      Sistema de gestión para kioscos
    </span>
  );

  const inner =
    variant === 'icon' ? (
      <StockRapidoBag className={cn(BAG[size])} />
    ) : variant === 'landing' ? (
      <span className="inline-flex flex-col items-center leading-none">
        <StockRapidoBag className={BAG[size]} />
        <Wordmark className={cn('mt-1.5 text-[var(--mk-ink)]', WORD[size])} />
        <span className="mt-1">{slogan}</span>
      </span>
    ) : variant === 'header' ? (
      <span className="inline-flex items-center gap-2.5 leading-none text-[var(--mk-ink)]">
        <StockRapidoBag className="h-10 w-10" />
        <span>
          <Wordmark className="block text-[17px]" />
          <span className="mt-1">{slogan}</span>
        </span>
      </span>
    ) : (
      <span className="inline-flex min-w-0 items-center gap-2 leading-none">
        <StockRapidoBag className="h-9 w-9" />
        <Wordmark className="truncate text-[15px] text-current" />
      </span>
    );

  if (!href) {
    return <span className={cn('inline-flex', className)}>{inner}</span>;
  }

  return (
    <Link href={href} className={cn('inline-flex', className)} aria-label="StockRápido">
      {inner}
    </Link>
  );
}
