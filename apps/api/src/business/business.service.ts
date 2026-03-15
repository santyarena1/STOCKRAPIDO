import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async getByUser(businessId: string) {
    return this.prisma.business.findUnique({
      where: { id: businessId },
    });
  }

  async update(businessId: string, data: { name?: string; cuit?: string; address?: string; posConfig?: object }) {
    return this.prisma.business.update({
      where: { id: businessId },
      data,
    });
  }

  async listCategories(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(businessId: string, name: string) {
    return this.prisma.category.create({
      data: { businessId, name },
    });
  }
}
