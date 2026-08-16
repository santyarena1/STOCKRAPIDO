import Link from 'next/link';
import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5 text-[var(--mk-ink)]', className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-[4px] bg-[var(--mk-red)] text-[13px] font-bold tracking-tight text-[#f7f1e4] shadow-[2px_2px_0_0_rgba(28,25,20,0.18)]">
        SR
        <span className="absolute -right-0.5 top-1 h-2 w-1.5 rounded-l-full bg-[var(--mk-paper)]" />
      </span>
      <span className="leading-none">
        <span className="block font-semibold tracking-tight">StockRápido</span>
        <span className="block text-[11px] font-normal text-[var(--mk-ink-3)]">para kioscos</span>
      </span>
    </Link>
  );
}
