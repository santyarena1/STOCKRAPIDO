import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ContainerProps = {
  className?: string;
  children: ReactNode;
};

export function Container({ className, children }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-4 py-6 sm:px-6', className)}>
      {children}
    </div>
  );
}
