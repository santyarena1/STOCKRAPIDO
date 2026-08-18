import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-tight text-fg">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-xl text-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:max-w-[min(100%,28rem)] lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
