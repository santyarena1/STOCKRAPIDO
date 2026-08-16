import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_LABELS,
  getPlan,
  hasFeature,
  planThatIncludes,
  PlanDefinition,
  PlanFeature,
  PlanId,
} from './plans';

export type PlanAccess = {
  planId: PlanId;
  plan: PlanDefinition;
  status: string;
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
  billingCycle: string;
  trialActive: boolean;
};

export async function resolvePlanAccess(prisma: PrismaService, businessId: string): Promise<PlanAccess> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      planId: true,
      planStatus: true,
      billingCycle: true,
      trialEndsAt: true,
      planRenewsAt: true,
    },
  });
  const status = business?.planStatus || 'active';
  const rawPlanId = status === 'canceled' ? 'mostrador' : business?.planId || 'kiosco';
  const plan = getPlan(rawPlanId);
  const now = Date.now();
  const trialActive = status === 'trial' && !!business?.trialEndsAt && business.trialEndsAt.getTime() > now;
  return {
    planId: plan.id,
    plan,
    status,
    trialEndsAt: business?.trialEndsAt ?? null,
    planRenewsAt: business?.planRenewsAt ?? null,
    billingCycle: business?.billingCycle || 'monthly',
    trialActive,
  };
}

export async function assertPlanFeature(
  prisma: PrismaService,
  businessId: string,
  feature: PlanFeature,
) {
  const access = await resolvePlanAccess(prisma, businessId);
  if (hasFeature(access.plan, feature)) return access;
  const label = FEATURE_LABELS[feature];
  const needed = planThatIncludes(feature);
  throw new ForbiddenException(
    `${label} está en el plan ${needed.name}. Tu plan actual es ${access.plan.name}. Podés cambiarlo en Plan y facturación.`,
  );
}

export async function assertUserLimit(prisma: PrismaService, businessId: string) {
  const access = await resolvePlanAccess(prisma, businessId);
  const max = access.plan.limits.maxUsers;
  if (max == null) return access;
  const count = await prisma.user.count({ where: { businessId, isActive: true } });
  if (count >= max) {
    throw new ForbiddenException(
      `Tu plan ${access.plan.name} admite hasta ${max} usuario${max === 1 ? '' : 's'}. Pasate a un plan superior para sumar al equipo.`,
    );
  }
  return access;
}

export async function assertProductLimit(prisma: PrismaService, businessId: string) {
  const access = await resolvePlanAccess(prisma, businessId);
  const max = access.plan.limits.maxProducts;
  if (max == null) return access;
  const count = await prisma.product.count({ where: { businessId } });
  if (count >= max) {
    throw new ForbiddenException(
      `Tu plan ${access.plan.name} admite hasta ${max.toLocaleString('es-AR')} productos. Pasate a un plan superior.`,
    );
  }
  return access;
}

export async function assertSyncLimit(prisma: PrismaService, businessId: string) {
  const access = await resolvePlanAccess(prisma, businessId);
  const max = access.plan.limits.maxSyncProviders;
  if (max === 0) {
    throw new ForbiddenException(
      `La importación de distribuidores (Tokin, Mondelez, Juntos+) está en el plan Pro. Tu plan actual es ${access.plan.name}.`,
    );
  }
  if (max == null) return access;
  const count = await prisma.syncConnection.count({ where: { businessId } });
  if (count >= max) {
    throw new ForbiddenException(
      `Tu plan ${access.plan.name} admite ${max} proveedor sincronizado. El plan Pro habilita Tokin, Mondelez y Juntos+ juntos.`,
    );
  }
  return access;
}
