import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type MoneyProps = {
  className?: string;
  children: ReactNode;
};

export function Money({ className, children }: MoneyProps) {
  return <span className={cn('font-mono tabular-nums', className)}>{children}</span>;
}
