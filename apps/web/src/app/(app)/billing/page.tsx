'use client';

export default function BillingPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-4">Plan y facturación</h1>
      <p className="text-slate-400 mb-4">Plan actual, límites (usuarios/sucursales/comprobantes), estado de pago. Integración MercadoPago (adaptador preparado).</p>
      <div data-tour="billing-info" className="rounded-lg border border-slate-700 bg-slate-800/30 p-6 text-slate-500">
        Módulo en construcción. TODO: Integración MercadoPago.
      </div>
    </div>
  );
}
