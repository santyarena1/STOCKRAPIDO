'use client';

import { Container } from '@/components/ui/Container';
import { Loader } from '@/components/ui/Loader';
import { ConfigProvider, useConfig } from './config-context';

function ConfigContent({ children }: { children: React.ReactNode }) {
  const { loading } = useConfig();
  return <Container className="max-w-3xl">{loading ? <Loader /> : children}</Container>;
}

export default function ConfigLayout({ children }: { children: React.ReactNode }) {
  return <ConfigProvider><ConfigContent>{children}</ConfigContent></ConfigProvider>;
}
