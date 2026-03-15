import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

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
    data: Partial<{ name: string; role: string; isActive: boolean; password?: string }>,
  ) {
    const update: Record<string, unknown> = { ...data };
    delete (update as { password?: string }).password;
    if (data.password) {
      (update as { passwordHash: string }).passwordHash = await argon2.hash(data.password, { type: 2 });
    }
    return this.prisma.user.update({
      where: { id, businessId },
      data: update,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  }
}
