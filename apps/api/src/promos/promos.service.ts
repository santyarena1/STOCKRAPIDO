import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export type ProductItem = { productId: string; qty: number };

export type PromoInput = {
  name: string;
  description?: string;
  type: 'percent' | 'fixed' | 'bogo' | 'precio_fijo';
  value: number;
  buyQty?: number;
  getQtyFree?: number;
  minPurchase?: number;
  productIds?: string[];
  productItems?: ProductItem[];
  categoryIds?: string[];
  promoCode?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
};

@Injectable()
export class PromosService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, activeOnly?: boolean) {
    const where: Record<string, unknown> = { businessId };
    if (activeOnly) {
      const now = new Date();
      where.isActive = true;
      where.AND = [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ];
    }
    return this.prisma.promo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string, businessId: string) {
    return this.prisma.promo.findFirst({
      where: { id, businessId },
    });
  }

  async create(businessId: string, data: PromoInput) {
    const productIdsJson = data.productIds?.length ? JSON.stringify(data.productIds) : null;
    const productItemsJson = data.productItems?.length ? JSON.stringify(data.productItems) : null;
    const categoryIdsJson = data.categoryIds?.length ? JSON.stringify(data.categoryIds) : null;
    return this.prisma.promo.create({
      data: {
        businessId,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        value: new Decimal(data.value),
        buyQty: data.buyQty ?? null,
        getQtyFree: data.getQtyFree ?? null,
        minPurchase: data.minPurchase != null ? new Decimal(data.minPurchase) : null,
        productIds: productIdsJson,
        productItems: productItemsJson,
        categoryIds: categoryIdsJson,
        promoCode: data.promoCode?.trim() || null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, businessId: string, data: Partial<PromoInput>) {
    const updateData: Record<string, unknown> = {};
    if (data.name != null) updateData.name = data.name;
    if (data.description != null) updateData.description = data.description;
    if (data.type != null) updateData.type = data.type;
    if (data.value != null) updateData.value = new Decimal(data.value);
    if (data.buyQty != null) updateData.buyQty = data.buyQty;
    if (data.getQtyFree != null) updateData.getQtyFree = data.getQtyFree;
    if (data.minPurchase != null) updateData.minPurchase = new Decimal(data.minPurchase);
    if (data.productIds != null) updateData.productIds = data.productIds?.length ? JSON.stringify(data.productIds) : null;
    if (data.productItems != null) updateData.productItems = data.productItems?.length ? JSON.stringify(data.productItems) : null;
    if (data.categoryIds != null) updateData.categoryIds = data.categoryIds?.length ? JSON.stringify(data.categoryIds) : null;
    if (data.promoCode != null) updateData.promoCode = data.promoCode?.trim() || null;
    if (data.validFrom != null) updateData.validFrom = data.validFrom ? new Date(data.validFrom) : null;
    if (data.validTo != null) updateData.validTo = data.validTo ? new Date(data.validTo) : null;
    if (data.isActive != null) updateData.isActive = data.isActive;

    return this.prisma.promo.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, businessId: string) {
    return this.prisma.promo.deleteMany({
      where: { id, businessId },
    });
  }

  async getActiveForCart(businessId: string, cartTotal: number, productIds: string[], categoryIds: string[]) {
    const now = new Date();
    const promos = await this.prisma.promo.findMany({
      where: {
        businessId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
    });
    // Filter by minPurchase and product/category scope
    return promos.filter((p) => {
      const min = Number(p.minPurchase ?? 0);
      if (cartTotal < min) return false;
      const pIds = p.productIds ? (JSON.parse(p.productIds) as string[]) : [];
      const cIds = p.categoryIds ? (JSON.parse(p.categoryIds) as string[]) : [];
      if (pIds.length === 0 && cIds.length === 0) return true;
      if (pIds.length > 0 && productIds.some((id) => pIds.includes(id))) return true;
      if (cIds.length > 0 && categoryIds.some((id) => cIds.includes(id))) return true;
      return false;
    });
  }
}
