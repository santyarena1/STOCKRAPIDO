'use client';

import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';

export default function BillingPage() {
  return (
    <Container className="space-y-6">
      <PageHeader title="Plan y facturación" subtitle="Consultá tu plan, límites y estado de pago." />
      <p className="text-slate-400 mb-4">Plan actual, límites (usuarios/sucursales/comprobantes), estado de pago. Integración MercadoPago (adaptador preparado).</p>
      <div data-tour="billing-info" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-500 sm:p-5">
        Módulo en construcción. TODO: Integración MercadoPago.
      </div>
    </Container>
  );
}
