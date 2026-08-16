'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { useSessionUser } from '@/lib/use-session-user';

export function PlatformGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, isPlatformAdmin } = useSessionUser();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (loading) return;
    setWaited(true);
    if (!isPlatformAdmin) router.replace('/dashboard');
  }, [loading, isPlatformAdmin, router]);

  if (loading || !waited || !isPlatformAdmin) {
    return (
      <Container>
        <PageHeader title="Panel admin" subtitle="Comprobando acceso…" />
        <Loader label="Cargando" />
      </Container>
    );
  }
  return <>{children}</>;
}
