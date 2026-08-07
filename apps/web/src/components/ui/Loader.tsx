import { cn } from '@/lib/cn';

/**
 * Loader de marca (anillo girando con el acento). Reemplaza los "Cargando..." sueltos.
 * - `full`: ocupa el alto de la vista (para el loading de una página).
 * - `label`: texto opcional debajo (default "Cargando").
 * - `size`: 'sm' | 'md' | 'lg'.
 */
export function Loader({
  label = 'Cargando',
  full = false,
  size = 'md',
  className,
}: {
  label?: string | null;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3',
        full ? 'min-h-[60vh]' : 'py-10',
        className,
      )}
    >
      <span className={cn('relative inline-flex', dim)}>
        <span className="absolute inset-0 rounded-full border-2 border-hair-soft" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[color:var(--brand-accent)] border-r-[color:var(--brand-accent)] [animation-duration:0.7s]" />
      </span>
      {label ? <span className="animate-pulse text-sm text-fg-faint">{label}…</span> : null}
    </div>
  );
}

/** Spinner chico en línea (para botones / estados inline). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] [animation-duration:0.7s]',
        className,
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}
