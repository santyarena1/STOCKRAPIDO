import { StockRapidoLogo } from '@/components/brand/StockRapidoLogo';
import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return <StockRapidoLogo variant="header" className={cn(className)} />;
}
