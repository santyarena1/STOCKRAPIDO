'use client';

import FiscalSettings from '@/components/FiscalSettings';
import { PageHeader } from '@/components/ui/PageHeader';

export default function FiscalPage() {
  return <div className="space-y-6"><PageHeader title="Fiscal" subtitle="Configurá la emisión de comprobantes fiscales." /><FiscalSettings /></div>;
}
