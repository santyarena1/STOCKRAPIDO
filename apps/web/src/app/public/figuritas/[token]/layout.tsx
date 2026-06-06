import type { Metadata } from 'next';
import { getApiBaseUrl } from '@/lib/env-urls';

type CatalogMeta = {
  business: { name: string };
  meta: { title: string; description: string };
  stats?: { availableUnits: number; countries: number };
};

async function fetchCatalogMeta(token: string): Promise<CatalogMeta | null> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/public/stickers/${token}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchCatalogMeta(token);

  if (!data) {
    return {
      title: 'Catálogo de Figuritas',
      description: 'Álbum de figuritas del Mundial 2026 — elegí las que te faltan y armá tu pedido.',
    };
  }

  const title = `${data.business.name} — Álbum de Figuritas Mundial 2026`;
  const description =
    data.meta?.description ??
    `Comprá figuritas sueltas en ${data.business.name}. Elegí las que te faltan, armá tu pedido online y retirá en el local.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'es_AR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function FiguritasPublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
