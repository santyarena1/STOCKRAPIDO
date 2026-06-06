'use client';

import { fig } from './theme';

export function FigMessage({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'error' }) {
  return <div className={variant === 'error' ? fig.msgError : fig.msgInfo}>{children}</div>;
}

export function FigCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`${fig.card} p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function FigBtnPrimary({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${fig.btnPrimary} ${className}`}>
      {children}
    </button>
  );
}

export function FigBtnSecondary({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${fig.btnSecondary} ${className}`}>
      {children}
    </button>
  );
}

export function FigInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${fig.input} ${className}`}
    />
  );
}

export function FigTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
      {tabs.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
            active === key ? fig.tabActive : fig.tabIdle
          }`}
        >
          {icon && <span>{icon}</span>}
          {label}
        </button>
      ))}
    </div>
  );
}

export function FigEmpty({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center py-10 sm:py-14 rounded-2xl border border-dashed border-red-900/40 bg-red-950/20">
      <span className="text-4xl sm:text-5xl">{emoji}</span>
      <p className="text-red-100/90 font-medium mt-3 text-sm sm:text-base">{title}</p>
      {subtitle && <p className="text-red-200/50 text-xs sm:text-sm mt-1 max-w-sm mx-auto px-4">{subtitle}</p>}
    </div>
  );
}

export function FigLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-red-500/30 border-t-red-400 animate-spin" />
      <p className="text-red-200/60 text-sm">{label}</p>
    </div>
  );
}
