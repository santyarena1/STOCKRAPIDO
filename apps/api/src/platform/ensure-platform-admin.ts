import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

export const PLATFORM_ADMIN_LOGIN = 'admin@admin.com';
export const PLATFORM_ADMIN_PASSWORD = 'Santy1234';
const LEGACY_ADMIN_LOGIN = 'admin';

/** Crea o actualiza el super admin: admin@admin.com / Santy1234 */
export async function ensurePlatformAdmin(prisma: PrismaClient): Promise<void> {
  const email = PLATFORM_ADMIN_LOGIN;
  let existing = await prisma.user.findUnique({ where: { email } });
  const legacy = await prisma.user.findUnique({ where: { email: LEGACY_ADMIN_LOGIN } });

  if (!existing && legacy) {
    await prisma.user.update({
      where: { id: legacy.id },
      data: {
        email,
        passwordHash: await argon2.hash(PLATFORM_ADMIN_PASSWORD, { type: 2 }),
        isPlatformAdmin: true,
        isActive: true,
        role: 'OWNER',
      },
    });
    console.log('Super admin migrado a admin@admin.com');
    return;
  }

  if (existing) {
    const samePass = await argon2.verify(existing.passwordHash, PLATFORM_ADMIN_PASSWORD).catch(() => false);
    if (samePass && existing.isPlatformAdmin && existing.isActive && existing.email === email) return;

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        passwordHash: await argon2.hash(PLATFORM_ADMIN_PASSWORD, { type: 2 }),
        isPlatformAdmin: true,
        isActive: true,
        role: 'OWNER',
      },
    });
    console.log('Super admin actualizado (admin@admin.com)');
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: 'StockRápido',
      planId: 'red',
      planStatus: 'active',
      billingCycle: 'yearly',
      trialEndsAt: null,
    },
  });

  await prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(PLATFORM_ADMIN_PASSWORD, { type: 2 }),
      name: 'Santy',
      role: 'OWNER',
      businessId: business.id,
      isPlatformAdmin: true,
      isActive: true,
    },
  });
  console.log('Super admin creado (admin@admin.com)');
}
