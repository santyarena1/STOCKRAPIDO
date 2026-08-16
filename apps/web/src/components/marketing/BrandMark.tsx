import Link from 'next/link';
import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5 text-[var(--mk-ink)]', className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mk-red)] text-[13px] font-extrabold text-white shadow-[0_6px_16px_-6px_rgba(227,28,35,0.8)]">
        SR
      </span>
      <span className="leading-none">
        <span className="block text-[17px] font-extrabold tracking-tight">StockRápido</span>
        <span className="block text-[11px] font-semibold text-[var(--mk-ink-3)]">sistema de gestión</span>
      </span>
    </Link>
  );
}
