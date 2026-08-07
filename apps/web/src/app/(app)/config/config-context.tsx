'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Business = {
  id: string;
  name: string;
  cuit?: string;
  address?: string;
  currency: string;
  posConfig?: {
    aiInvoice?: { n8nWebhookUrl?: string; publicApiUrl?: string; hasWebhookSecret?: boolean };
    branding?: { accentColor?: string; logoUrl?: string; faviconUrl?: string; ticketLogoUrl?: string; appTitle?: string; receiptName?: string; receiptTemplate?: 'clasico' | 'moderno'; linkColor?: string; primaryButtonColor?: string; focusRingColor?: string; navActiveColor?: string; selectionColor?: string; shadowTintColor?: string };
    customerDisplay?: { mercadopagoAlias?: string; mercadopagoQrUrl?: string; promoImageUrls?: string[] };
  };
};
export type BusinessCategory = { id: string; name: string };
type ConfigContextValue = { business: Business | null; categories: BusinessCategory[]; loading: boolean; setBusiness: React.Dispatch<React.SetStateAction<Business | null>>; setCategories: React.Dispatch<React.SetStateAction<BusinessCategory[]>>; refetch: () => Promise<void> };
const ConfigContext = createContext<ConfigContextValue | null>(null);

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig debe usarse dentro de ConfigProvider.');
  return context;
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const refetch = async () => {
    const [nextBusiness, nextCategories] = await Promise.all([api<Business>('/business/me'), api<BusinessCategory[]>('/business/categories')]);
    setBusiness(nextBusiness); setCategories(nextCategories);
  };
  useEffect(() => { refetch().catch(() => {}).finally(() => setLoading(false)); }, []);
  return <ConfigContext.Provider value={{ business, categories, loading, setBusiness, setCategories, refetch }}>{children}</ConfigContext.Provider>;
}
