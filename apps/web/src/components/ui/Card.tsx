import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

export function Card({ as: Component = 'div', className, children }: CardProps) {
  return (
    <Component
      className={cn('rounded-xl border border-hair-soft bg-surface p-4 sm:p-5', className)}
    >
      {children}
    </Component>
  );
}
