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
  resolveTenantAccessFromBusiness,
  TenantAccessMode,
  TenantAccessReason,
} from './plans';

export type PlanAccess = {
  planId: PlanId;
  plan: PlanDefinition;
  status: string;
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
  billingCycle: string;
  trialActive: boolean;
  accessMode: TenantAccessMode;
  accessReason: TenantAccessReason;
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
  const tenant = resolveTenantAccessFromBusiness({
    planId: business?.planId || 'mostrador',
    planStatus: status,
    trialEndsAt: business?.trialEndsAt ?? null,
  });
  const plan = getPlan(tenant.effectivePlanId);
  return {
    planId: plan.id,
    plan,
    status,
    trialEndsAt: business?.trialEndsAt ?? null,
    planRenewsAt: business?.planRenewsAt ?? null,
    billingCycle: business?.billingCycle || 'monthly',
    trialActive: tenant.trialActive,
    accessMode: tenant.mode,
    accessReason: tenant.reason,
  };
}

export async function assertWritableTenant(prisma: PrismaService, businessId: string) {
  const access = await resolvePlanAccess(prisma, businessId);
  if (access.accessMode === 'read_only') {
    const messages: Record<string, string> = {
      trial_expired: 'Tu prueba terminó. Activá tu plan para seguir operando.',
      pending_payment: 'Tenés un pago pendiente. Regularizá tu plan para volver a cargar datos.',
      past_due: 'Tu plan está vencido. Actualizá el pago para seguir operando.',
      canceled: 'Tu cuenta está cancelada. Solo podés consultar información.',
    };
    throw new ForbiddenException(
      messages[access.accessReason || ''] ||
        'Tu cuenta está en modo solo lectura. Andá a Plan y facturación para activarla.',
    );
  }
  return access;
}

export async function assertPlanFeature(
  prisma: PrismaService,
  businessId: string,
  feature: PlanFeature,
) {
  const access = await assertWritableTenant(prisma, businessId);
  if (hasFeature(access.plan, feature)) return access;
  const label = FEATURE_LABELS[feature];
  const needed = planThatIncludes(feature);
  throw new ForbiddenException(
    `${label} está en el plan ${needed.name}. Tu plan actual es ${access.plan.name}. Podés cambiarlo en Plan y facturación.`,
  );
}

/** Verifica feature del plan sin exigir modo escritura (consultas, catálogo, reportes). */
export async function assertPlanFeatureRead(
  prisma: PrismaService,
  businessId: string,
  feature: PlanFeature,
) {
  const access = await resolvePlanAccess(prisma, businessId);
  if (hasFeature(access.plan, feature)) return access;
  const label = FEATURE_LABELS[feature];
  const needed = planThatIncludes(feature);
  throw new ForbiddenException(
    `${label} está en el plan ${needed.name}. Tu plan actual es ${access.plan.name}.`,
  );
}

export async function assertUserLimit(prisma: PrismaService, businessId: string) {
  const access = await assertWritableTenant(prisma, businessId);
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
  const access = await assertWritableTenant(prisma, businessId);
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
  const access = await assertWritableTenant(prisma, businessId);
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

export async function assertCatalogPublishLimit(prisma: PrismaService, businessId: string) {
  const access = await assertWritableTenant(prisma, businessId);
  const max = access.plan.limits.maxCatalogPublish;
  if (max == null) return access;
  const count = await prisma.publicProduct.count({
    where: { publishedByBusinessId: businessId, status: 'active' },
  });
  if (count >= max) {
    throw new ForbiddenException(
      `Tu plan ${access.plan.name} admite publicar hasta ${max} fichas en el catálogo comunitario.`,
    );
  }
  return access;
}

export async function assertCatalogImportLimit(prisma: PrismaService, businessId: string, qty = 1) {
  const access = await assertWritableTenant(prisma, businessId);
  await assertPlanFeature(prisma, businessId, 'publicCatalog');
  const max = access.plan.limits.maxCatalogImportPerMonth;
  if (max == null) return access;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const count = await prisma.catalogImportLog.count({
    where: { businessId, importedAt: { gte: start } },
  });
  if (count + qty > max) {
    throw new ForbiddenException(
      `Tu plan ${access.plan.name} admite importar hasta ${max} productos del catálogo por mes.`,
    );
  }
  return access;
}
