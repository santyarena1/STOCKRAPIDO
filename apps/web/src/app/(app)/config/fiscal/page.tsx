'use client';

import FiscalSettings from '@/components/FiscalSettings';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlanGate } from '@/components/billing/PlanGate';

export default function FiscalPage() {
  return (
    <PlanGate feature="fiscal">
      <div className="space-y-6">
        <PageHeader title="Fiscal" subtitle="Configurá la emisión de comprobantes fiscales." />
        <FiscalSettings />
      </div>
    </PlanGate>
  );
}
