'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getPlan, hasFeature, type PlanDefinition, type PlanFeature } from '@/lib/plans';

export type BillingInvoice = {
  id: string;
  planId: string;
  planName: string;
  cycle: string;
  amount: number;
  discount?: number;
  listAmount?: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  method: string | null;
  notes: string | null;
  createdAt: string;
};

export type BillingReferral = {
  code: string;
  shareUrl: string;
  discountPerMonth: number;
  discountMonths: number;
  referredBy: { businessName: string; code: string; monthsLeft: number } | null;
  referralsMade: Array<{
    id: string;
    businessName: string;
    createdAt: string;
    monthsLeft: number;
  }>;
  activeDiscount: {
    monthlyAmount: number;
    monthsLeftAsReferee: number;
    monthsLeftAsReferrer: number;
  };
};

export type BillingMe = {
  plan: PlanDefinition;
  planId: string;
  status: string;
  billingCycle: string;
  trialEndsAt: string | null;
  planRenewsAt: string | null;
  trialActive: boolean;
  trialDays: number;
  accessMode?: 'full' | 'read_only';
  accessReason?: string | null;
  paymentStatus: string;
  paymentStatusLabel: string;
  lastPaidAt: string | null;
  lastPaidInvoice: BillingInvoice | null;
  usage: { users: number; products: number; syncProviders: number };
  limits: PlanDefinition['limits'];
  invoices: BillingInvoice[];
  pendingInvoice: BillingInvoice | null;
  transfer: { alias: string; cbu: string; cuit: string; whatsapp: string; holder: string };
  mercadopagoEnabled: boolean;
  referral?: BillingReferral | null;
};

type BillingContextValue = {
  data: BillingMe | null;
  loading: boolean;
  refresh: () => Promise<void>;
  can: (feature: PlanFeature) => boolean;
  readOnly: boolean;
};

const BillingContext = createContext<BillingContextValue>({
  data: null,
  loading: true,
  refresh: async () => {},
  can: () => true,
  readOnly: false,
});

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<BillingMe>('/billing/me');
      setData({ ...me, plan: getPlan(me.planId) });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<BillingContextValue>(
    () => ({
      data,
      loading,
      refresh,
      readOnly: data?.accessMode === 'read_only',
      can: (feature) => {
        if (!data) return true;
        return hasFeature(data.plan, feature);
      },
    }),
    [data, loading, refresh],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}
