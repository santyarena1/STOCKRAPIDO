import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { assertUserLimit } from '../billing/plan-guard';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    businessId: string,
    data: { email: string; name: string; password: string; role: string },
  ) {
    const hash = await argon2.hash(data.password, { type: 2 });
    await assertUserLimit(this.prisma, businessId);
    return this.prisma.user.create({
      data: {
        businessId,
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: hash,
        role: data.role as 'OWNER' | 'ADMIN' | 'CAJERO' | 'REPOSITOR' | 'LECTOR',
      },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async update(
    id: string,
    businessId: string,
    data: Partial<{ name: string; email: string; role: string; isActive: boolean; password?: string }>,
  ) {
    const current = await this.prisma.user.findFirst({ where: { id, businessId } });
    if (!current) throw new BadRequestException('Usuario no encontrado.');

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('El nombre es obligatorio.');
      update.name = name;
    }
    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('El email es obligatorio.');
      const taken = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Ese email ya está en uso.');
      update.email = email;
    }
    if (data.role !== undefined) update.role = data.role;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.password) {
      update.passwordHash = await argon2.hash(data.password, { type: 2 });
    }

    return this.prisma.user.update({
      where: { id, businessId },
      data: update,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  }
}
