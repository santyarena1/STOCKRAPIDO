import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

export const PLATFORM_ADMIN_LOGIN = 'admin';
export const PLATFORM_ADMIN_PASSWORD = 'Santy1234';

/** Crea o actualiza el super admin de plataforma: admin / Santy1234 */
export async function ensurePlatformAdmin(prisma: PrismaClient): Promise<void> {
  const email = PLATFORM_ADMIN_LOGIN;
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const samePass = await argon2.verify(existing.passwordHash, PLATFORM_ADMIN_PASSWORD).catch(() => false);
    if (samePass && existing.isPlatformAdmin && existing.isActive) return;

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await argon2.hash(PLATFORM_ADMIN_PASSWORD, { type: 2 }),
        isPlatformAdmin: true,
        isActive: true,
        role: 'OWNER',
      },
    });
    console.log('Super admin actualizado (admin)');
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
  console.log('Super admin creado (admin)');
}
