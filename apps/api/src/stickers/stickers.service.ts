import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { WORLDCUP_2026_COUNTRIES } from './worldcup-countries.seed';

type PriceEntry = { countryId: string; price: number };
type OrderItem = { stickerId: string; qty: number };

@Injectable()
export class StickersService {
  constructor(private prisma: PrismaService) {}

  // ---------- Countries ----------

  async seedCountries(businessId: string) {
    let created = 0;
    let updated = 0;

    for (const country of WORLDCUP_2026_COUNTRIES) {
      const existing = await this.prisma.stickerCountry.findUnique({
        where: { businessId_name: { businessId, name: country.name } },
      });

      if (existing) {
        await this.prisma.stickerCountry.update({
          where: { id: existing.id },
          data: { flag: country.flag, isActive: true },
        });
        updated++;
      } else {
        await this.prisma.stickerCountry.create({
          data: {
            businessId,
            name: country.name,
            flag: country.flag,
            priceUnit: new Decimal(0),
          },
        });
        created++;
      }
    }

    return { created, updated, total: WORLDCUP_2026_COUNTRIES.length };
  }

  listCountries(businessId: string) {
    return this.prisma.stickerCountry.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { stickers: true } } },
    });
  }

  async updateCountryPrice(businessId: string, countryId: string, price: number) {
    const country = await this.prisma.stickerCountry.findFirst({
      where: { id: countryId, businessId },
    });
    if (!country) throw new NotFoundException('País no encontrado');

    return this.prisma.stickerCountry.update({
      where: { id: countryId },
      data: { priceUnit: new Decimal(price) },
    });
  }

  async bulkUpdatePrices(businessId: string, prices: PriceEntry[]) {
    let updated = 0;

    for (const entry of prices) {
      const country = await this.prisma.stickerCountry.findFirst({
        where: { id: entry.countryId, businessId },
      });
      if (!country) continue;

      await this.prisma.stickerCountry.update({
        where: { id: entry.countryId },
        data: { priceUnit: new Decimal(entry.price) },
      });
      updated++;
    }

    return { updated };
  }

  // ---------- Stickers ----------

  async ensureStickersForCountry(businessId: string, countryId: string, maxNumber: number) {
    const country = await this.prisma.stickerCountry.findFirst({
      where: { id: countryId, businessId },
    });
    if (!country) throw new NotFoundException('País no encontrado');

    const existing = await this.prisma.sticker.findMany({
      where: { businessId, countryId },
      select: { number: true },
    });
    const existingNumbers = new Set(existing.map((s) => s.number));

    const toCreate: { businessId: string; countryId: string; number: number; stock: number }[] = [];
    for (let n = 1; n <= maxNumber; n++) {
      if (!existingNumbers.has(n)) {
        toCreate.push({ businessId, countryId, number: n, stock: 0 });
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.sticker.createMany({ data: toCreate });
    }

    return { created: toCreate.length, total: maxNumber };
  }

  async upsertSticker(businessId: string, countryId: string, number: number, stock: number) {
    const country = await this.prisma.stickerCountry.findFirst({
      where: { id: countryId, businessId },
    });
    if (!country) throw new NotFoundException('País no encontrado');

    return this.prisma.sticker.upsert({
      where: { businessId_countryId_number: { businessId, countryId, number } },
      create: { businessId, countryId, number, stock },
      update: { stock },
    });
  }

  listStickersForCountry(businessId: string, countryId: string) {
    return this.prisma.sticker.findMany({
      where: { businessId, countryId },
      orderBy: { number: 'asc' },
    });
  }

  // ---------- Catalog Share ----------

  async getOrCreateShare(businessId: string) {
    const existing = await this.prisma.stickerCatalogShare.findUnique({
      where: { businessId },
    });
    if (existing) return existing;

    return this.prisma.stickerCatalogShare.create({
      data: { businessId },
    });
  }

  async getCatalogByToken(token: string) {
    const share = await this.prisma.stickerCatalogShare.findUnique({
      where: { token },
      include: { business: { select: { name: true } } },
    });
    if (!share || !share.isActive) throw new NotFoundException('Catálogo no encontrado o inactivo');

    const countries = await this.prisma.stickerCountry.findMany({
      where: { businessId: share.businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        stickers: {
          orderBy: { number: 'asc' },
          select: { id: true, number: true, stock: true },
        },
      },
    });

    return {
      business: { name: share.business.name },
      countries: countries.map((c) => ({
        id: c.id,
        name: c.name,
        flag: c.flag,
        priceUnit: c.priceUnit,
        stickers: c.stickers,
      })),
    };
  }

  // ---------- Orders ----------

  async createOrder(
    shareId: string,
    buyerName: string | undefined,
    buyerPhone: string | undefined,
    notes: string | undefined,
    items: OrderItem[],
  ) {
    const share = await this.prisma.stickerCatalogShare.findUnique({
      where: { token: shareId },
    });
    if (!share || !share.isActive) throw new NotFoundException('Catálogo no encontrado o inactivo');

    const businessId = share.businessId;

    // Validate stock and calculate total
    let total = new Decimal(0);
    const resolvedItems: {
      sticker: { id: string; stock: number; country: { priceUnit: Decimal } };
      qty: number;
    }[] = [];

    for (const item of items) {
      const sticker = await this.prisma.sticker.findFirst({
        where: { id: item.stickerId, businessId },
        include: { country: { select: { priceUnit: true } } },
      });
      if (!sticker) throw new NotFoundException(`Figurita ${item.stickerId} no encontrada`);
      if (sticker.stock < item.qty) {
        throw new BadRequestException(
          `Stock insuficiente para figurita ${item.stickerId}. Disponible: ${sticker.stock}`,
        );
      }
      resolvedItems.push({ sticker, qty: item.qty });
      total = total.add(sticker.country.priceUnit.mul(item.qty));
    }

    // Create order and deduct stock in a transaction
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.stickerOrder.create({
        data: {
          businessId,
          shareId,
          buyerName,
          buyerPhone,
          notes,
          total,
          items: {
            create: resolvedItems.map(({ sticker, qty }) => ({
              stickerId: sticker.id,
              qty,
              unitPrice: sticker.country.priceUnit,
            })),
          },
        },
        include: { items: true },
      });

      for (const { sticker, qty } of resolvedItems) {
        await tx.sticker.update({
          where: { id: sticker.id },
          data: { stock: sticker.stock - qty },
        });
      }

      return order;
    });
  }

  listOrders(businessId: string) {
    return this.prisma.stickerOrder.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            sticker: {
              include: { country: { select: { name: true, flag: true } } },
            },
          },
        },
      },
    });
  }

  async updateOrderStatus(businessId: string, orderId: string, status: string) {
    const order = await this.prisma.stickerOrder.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    const RETURNABLE_STATUSES = ['pending', 'confirmed'];
    const shouldReturnStock =
      status === 'cancelled' && RETURNABLE_STATUSES.includes(order.status);

    return this.prisma.$transaction(async (tx) => {
      if (shouldReturnStock) {
        for (const item of order.items) {
          await tx.sticker.update({
            where: { id: item.stickerId },
            data: { stock: { increment: item.qty } },
          });
        }
      }

      return tx.stickerOrder.update({
        where: { id: orderId },
        data: { status },
        include: { items: true },
      });
    });
  }

  async deleteOrder(businessId: string, orderId: string) {
    const order = await this.prisma.stickerOrder.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    const RETURNABLE_STATUSES = ['pending', 'confirmed'];
    const shouldReturnStock = RETURNABLE_STATUSES.includes(order.status);

    return this.prisma.$transaction(async (tx) => {
      if (shouldReturnStock) {
        for (const item of order.items) {
          await tx.sticker.update({
            where: { id: item.stickerId },
            data: { stock: { increment: item.qty } },
          });
        }
      }

      await tx.stickerOrder.delete({ where: { id: orderId } });
      return { ok: true };
    });
  }
}
