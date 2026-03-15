import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PausedSalesService {
  constructor(private prisma: PrismaService) {}

  async save(businessId: string, userId: string, payload: { items: unknown[]; discount?: number }) {
    return this.prisma.pausedSale.create({
      data: { businessId, userId, payload: payload as object },
    });
  }

  async list(businessId: string, userId: string) {
    return this.prisma.pausedSale.findMany({
      where: { businessId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async remove(id: string, businessId: string, userId: string) {
    await this.prisma.pausedSale.deleteMany({
      where: { id, businessId, userId },
    });
    return { ok: true };
  }
}
