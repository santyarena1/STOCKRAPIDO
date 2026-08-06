'use client';

import { Container } from '@/components/ui/Container';
import { ConfigProvider, useConfig } from './config-context';

function ConfigContent({ children }: { children: React.ReactNode }) {
  const { loading } = useConfig();
  return <Container className="max-w-3xl">{loading ? <div className="text-fg-muted">Cargando...</div> : children}</Container>;
}

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  return <ConfigProvider><ConfigContent>{children}</ConfigContent></ConfigProvider>;
}
