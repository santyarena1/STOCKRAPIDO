'use client';

import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';

const SECTIONS = [
  {
    title: 'Mi kiosco',
    desc: 'Datos del negocio, apariencia y categorías.',
    items: [
      { href: '/config/negocio', label: 'Negocio', hint: 'Nombre, CUIT y dirección' },
      { href: '/config/apariencia', label: 'Apariencia', hint: 'Logo, colores y título' },
      { href: '/config/categorias', label: 'Categorías', hint: 'Organizá productos' },
    ],
  },
  {
    title: 'Punto de venta',
    desc: 'Ticket, vendedores y pantalla del cliente.',
    items: [
      { href: '/config/ticket', label: 'Ticket', hint: 'Comprobante impreso' },
      { href: '/config/vendedores', label: 'Vendedores', hint: 'Quién cobra en el POS' },
      { href: '/config/pantalla', label: 'Pantalla cliente', hint: 'Segundo monitor / QR' },
    ],
  },
  {
    title: 'Facturación',
    desc: 'ARCA y comprobantes electrónicos (plan Fiscal).',
    items: [{ href: '/config/fiscal', label: 'Fiscal AFIP', hint: 'Certificado y punto de venta', plan: 'PRO' },
      { href: '/compras/arca', label: 'Compras ARCA', hint: 'Comprobantes recibidos', plan: 'PRO' }],
  },
  {
    title: 'Integraciones',
    desc: 'Herramientas opcionales según tu plan.',
    items: [
      { href: '/config/proveedores', label: 'Proveedores / Sync', hint: '1 conexión en PRO, ilimitado en Premium', plan: 'PRO' },
      { href: '/config/serper', label: 'Imágenes Serper', hint: 'Fotos desde Google' },
      { href: '/config/compras-ia', label: 'Compras IA', hint: 'PDF de facturas', plan: 'PREMIUM' },
    ],
  },
  {
    title: 'Cuenta y seguridad',
    desc: 'Plan, usuarios y sesiones.',
    items: [
      { href: '/billing', label: 'Plan y facturación', hint: 'Tu suscripción a StockRápido' },
      { href: '/usuarios', label: 'Usuarios', hint: 'Equipo y roles' },
      { href: '/config/seguridad', label: 'Seguridad', hint: 'Cerrar sesión en todos los dispositivos' },
    ],
  },
  {
    title: 'Avanzado',
    desc: 'Zona de riesgo.',
    items: [{ href: '/config/eliminar-datos', label: 'Eliminar datos', hint: 'Borrado por categoría', danger: true }],
  },
];

export default function ConfigHubPage() {
  return (
    <Container className="max-w-3xl space-y-8 py-2">
      <PageHeader title="Configuración" subtitle="Todo lo de tu kiosco, agrupado por tema." />
      <p className="text-sm text-fg-muted -mt-4">
        ¿Primera vez? Podés retomar la{' '}
        <Link href="/setup" className="text-brand font-medium hover:underline">
          configuración inicial
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-xl border border-hair-soft bg-surface p-4">
            <h2 className="font-semibold text-fg">{section.title}</h2>
            <p className="text-xs text-fg-faint mt-0.5 mb-3">{section.desc}</p>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-lg border px-3 py-2.5 transition hover:bg-raised ${
                      'danger' in item && item.danger ? 'border-crit/30' : 'border-hair-soft'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{item.label}</span>
                      {'plan' in item && item.plan ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-brand">{item.plan}</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-fg-faint mt-0.5">{item.hint}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
