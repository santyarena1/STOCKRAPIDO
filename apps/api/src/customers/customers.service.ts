import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, withBalance?: boolean) {
    const where: Record<string, unknown> = { businessId };
    if (withBalance) (where as { balance: { gt: number } }).balance = { gt: 0 };
    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async create(businessId: string, data: { name: string; phone?: string; notes?: string }) {
    return this.prisma.customer.create({
      data: { businessId, ...data },
    });
  }

  async update(id: string, businessId: string, data: Partial<{ name: string; phone: string; notes: string }>) {
    return this.prisma.customer.update({
      where: { id, businessId },
      data,
    });
  }

  async addPayment(customerId: string, businessId: string, amount: number, note?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) return null;
    const amt = new Decimal(amount);
    await this.prisma.customerPayment.create({
      data: { customerId, amount: amt, note },
    });
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: amt } },
      include: { payments: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
  }

  async getPayments(customerId: string, businessId: string, limit = 50) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) return [];
    return this.prisma.customerPayment.findMany({
      where: { customerId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMorosos(businessId: string) {
    return this.prisma.customer.findMany({
      where: { businessId, balance: { gt: 0 } },
      orderBy: { balance: 'desc' },
    });
  }

  async getTotalFiado(businessId: string) {
    const result = await this.prisma.customer.aggregate({
      where: { businessId },
      _sum: { balance: true },
    });
    return result._sum.balance ?? 0;
  }
}
