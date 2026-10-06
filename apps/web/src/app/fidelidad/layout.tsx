import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fidelización',
  description: 'Tus puntos del local',
  manifest: '/fidelidad.webmanifest',
  appleWebApp: { capable: true, title: 'Fidelización' },
};

export default function FidelidadLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-app text-fg">{children}</div>;
}
