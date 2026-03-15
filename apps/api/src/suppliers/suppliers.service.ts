import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string) {
    return this.prisma.supplier.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { purchases: true } },
      },
    });
  }

  async create(businessId: string, data: { name: string; phone?: string; email?: string; address?: string }) {
    return this.prisma.supplier.create({
      data: { businessId, ...data },
    });
  }

  async update(id: string, businessId: string, data: Partial<{ name: string; phone: string; email: string; address: string }>) {
    return this.prisma.supplier.update({
      where: { id, businessId },
      data,
    });
  }

  async getPurchases(supplierId: string, businessId: string, limit = 30) {
    return this.prisma.purchase.findMany({
      where: { supplierId, businessId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    });
  }
}
