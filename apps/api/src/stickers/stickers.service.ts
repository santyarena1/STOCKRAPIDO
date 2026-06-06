import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { WORLDCUP_2026_COUNTRIES } from './worldcup-countries.seed';

type PriceEntry = { countryId: string; price: number };
type StickerPriceEntry = { stickerId: string; price: number | null };
type OrderItem = { stickerId: string; qty: number };
type StockEntry = { number: number; stock?: number; delta?: number };

const RETURNABLE_STATUSES = ['pending', 'confirmed'];

function effectiveStickerPrice(
  sticker: { priceUnit: Decimal | null },
  country: { priceUnit: Decimal },
): Decimal {
  return sticker.priceUnit ?? country.priceUnit;
}

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
          data: { flag: country.flag, code: country.code, isActive: true },
        });
        updated++;
      } else {
        await this.prisma.stickerCountry.create({
          data: {
            businessId,
            name: country.name,
            code: country.code,
            flag: country.flag,
            priceUnit: new Decimal(0),
          },
        });
        created++;
      }
    }

    return { created, updated, total: WORLDCUP_2026_COUNTRIES.length };
  }

  listCountries(businessId: string, includeInactive = false) {
    return this.prisma.stickerCountry.findMany({
      where: includeInactive ? { businessId } : { businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { stickers: true } } },
    });
  }

  async createCountry(
    businessId: string,
    data: { name: string; code?: string; flag?: string; flagUrl?: string; price?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('El nombre del país es obligatorio');

    return this.prisma.stickerCountry.create({
      data: {
        businessId,
        name,
        code: data.code?.trim() || null,
        flag: data.flag?.trim() || null,
        flagUrl: data.flagUrl?.trim() || null,
        priceUnit: new Decimal(data.price ?? 0),
      },
    });
  }

  async updateCountry(
    businessId: string,
    countryId: string,
    data: {
      name?: string;
      code?: string;
      flag?: string;
      flagUrl?: string;
      price?: number;
      isActive?: boolean;
    },
  ) {
    const country = await this.prisma.stickerCountry.findFirst({
      where: { id: countryId, businessId },
    });
    if (!country) throw new NotFoundException('País no encontrado');

    return this.prisma.stickerCountry.update({
      where: { id: countryId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim() || null } : {}),
        ...(data.flag !== undefined ? { flag: data.flag.trim() || null } : {}),
        ...(data.flagUrl !== undefined ? { flagUrl: data.flagUrl.trim() || null } : {}),
        ...(data.price !== undefined ? { priceUnit: new Decimal(data.price) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async updateCountryPrice(businessId: string, countryId: string, price: number) {
    return this.updateCountry(businessId, countryId, { price });
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

  async setGlobalPrice(businessId: string, price: number) {
    if (price < 0) throw new BadRequestException('El precio no puede ser negativo');

    const [countries, stickers] = await this.prisma.$transaction([
      this.prisma.stickerCountry.updateMany({
        where: { businessId },
        data: { priceUnit: new Decimal(price) },
      }),
      this.prisma.sticker.updateMany({
        where: { businessId },
        data: { priceUnit: null },
      }),
    ]);

    return { countriesUpdated: countries.count, stickerOverridesCleared: stickers.count, price };
  }

  async bulkUpdateStickerPrices(businessId: string, prices: StickerPriceEntry[]) {
    let updated = 0;

    for (const entry of prices) {
      const sticker = await this.prisma.sticker.findFirst({
        where: { id: entry.stickerId, businessId },
      });
      if (!sticker) continue;

      await this.prisma.sticker.update({
        where: { id: entry.stickerId },
        data: {
          priceUnit: entry.price === null ? null : new Decimal(entry.price),
        },
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
    if (maxNumber < 1 || maxNumber > 999) {
      throw new BadRequestException('maxNumber debe estar entre 1 y 999');
    }

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
    if (stock < 0) throw new BadRequestException('El stock no puede ser negativo');

    return this.prisma.sticker.upsert({
      where: { businessId_countryId_number: { businessId, countryId, number } },
      create: { businessId, countryId, number, stock },
      update: { stock },
    });
  }

  async bulkUpdateStickers(
    businessId: string,
    countryId: string,
    entries: StockEntry[],
  ) {
    const country = await this.prisma.stickerCountry.findFirst({
      where: { id: countryId, businessId },
    });
    if (!country) throw new NotFoundException('País no encontrado');

    let updated = 0;
    for (const entry of entries) {
      if (entry.number < 1) continue;

      if (entry.delta !== undefined && entry.delta !== 0) {
        const existing = await this.prisma.sticker.findUnique({
          where: { businessId_countryId_number: { businessId, countryId, number: entry.number } },
        });
        const next = Math.max(0, (existing?.stock ?? 0) + entry.delta);
        await this.prisma.sticker.upsert({
          where: { businessId_countryId_number: { businessId, countryId, number: entry.number } },
          create: { businessId, countryId, number: entry.number, stock: next },
          update: { stock: next },
        });
        updated++;
      } else if (entry.stock !== undefined) {
        await this.upsertSticker(businessId, countryId, entry.number, Math.max(0, entry.stock));
        updated++;
      }
    }

    return { updated };
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

  async updateShare(businessId: string, isActive: boolean) {
    const share = await this.getOrCreateShare(businessId);
    return this.prisma.stickerCatalogShare.update({
      where: { id: share.id },
      data: { isActive },
    });
  }

  async getCatalogByToken(token: string) {
    const share = await this.prisma.stickerCatalogShare.findUnique({
      where: { token },
      include: { business: { select: { name: true, address: true } } },
    });
    if (!share || !share.isActive) throw new NotFoundException('Catálogo no encontrado o inactivo');

    const countries = await this.prisma.stickerCountry.findMany({
      where: { businessId: share.businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        stickers: {
          orderBy: { number: 'asc' },
          select: { id: true, number: true, stock: true, priceUnit: true },
        },
      },
    });

    const mapped = countries
      .filter((c) => c.stickers.length > 0)
      .map((c) => {
        const availableCount = c.stickers.filter((s) => s.stock > 0).length;
        const totalUnits = c.stickers.reduce((acc, s) => acc + s.stock, 0);
        const maxNumber = c.stickers.reduce((max, s) => Math.max(max, s.number), 0);
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          flag: c.flag,
          flagUrl: c.flagUrl,
          priceUnit: c.priceUnit,
          maxNumber,
          availableCount,
          totalUnits,
          stickers: c.stickers.map((s) => ({
            id: s.id,
            number: s.number,
            stock: s.stock,
            priceUnit: s.priceUnit,
            effectivePrice: effectiveStickerPrice(s, c),
          })),
        };
      });

    const totalSlots = mapped.reduce((acc, c) => acc + c.stickers.length, 0);
    const availableSlots = mapped.reduce((acc, c) => acc + c.availableCount, 0);
    const availableUnits = mapped.reduce((acc, c) => acc + c.totalUnits, 0);

    return {
      business: { name: share.business.name, address: share.business.address },
      meta: {
        title: 'Álbum de Figuritas — Mundial 2026',
        description:
          'Elegí las figuritas que te faltan, armá tu pedido y retiralo en el local. Las casillas doradas están disponibles.',
      },
      stats: {
        countries: mapped.length,
        totalSlots,
        availableSlots,
        availableUnits,
      },
      countries: mapped,
    };
  }

  // ---------- Orders ----------

  async createOrder(
    token: string,
    buyerName: string | undefined,
    buyerPhone: string | undefined,
    notes: string | undefined,
    items: OrderItem[],
  ) {
    const share = await this.prisma.stickerCatalogShare.findUnique({
      where: { token },
    });
    if (!share || !share.isActive) throw new NotFoundException('Catálogo no encontrado o inactivo');
    if (!items.length) throw new BadRequestException('El pedido debe tener al menos un ítem');

    const businessId = share.businessId;

    let total = new Decimal(0);
    const resolvedItems: {
      sticker: { id: string; stock: number; number: number; country: { name: string; flag: string | null; priceUnit: Decimal } };
      qty: number;
      unitPrice: Decimal;
    }[] = [];

    for (const item of items) {
      if (item.qty < 1) continue;
      const sticker = await this.prisma.sticker.findFirst({
        where: { id: item.stickerId, businessId },
        include: { country: { select: { name: true, flag: true, priceUnit: true } } },
      });
      if (!sticker) throw new NotFoundException(`Figurita no encontrada`);
      if (sticker.stock < item.qty) {
        throw new BadRequestException(
          `Stock insuficiente para ${sticker.country.flag ?? ''} #${sticker.number}. Disponible: ${sticker.stock}`,
        );
      }
      const unitPrice = effectiveStickerPrice(sticker, sticker.country);
      resolvedItems.push({ sticker, qty: item.qty, unitPrice });
      total = total.add(unitPrice.mul(item.qty));
    }

    if (!resolvedItems.length) throw new BadRequestException('Pedido vacío');

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.stickerOrder.create({
        data: {
          businessId,
          shareId: share.id,
          buyerName: buyerName?.trim() || null,
          buyerPhone: buyerPhone?.trim() || null,
          notes: notes?.trim() || null,
          total,
          items: {
            create: resolvedItems.map(({ sticker, qty, unitPrice }) => ({
              stickerId: sticker.id,
              qty,
              unitPrice,
            })),
          },
        },
        include: {
          items: {
            include: {
              sticker: { include: { country: { select: { name: true, flag: true } } } },
            },
          },
        },
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

  listOrders(businessId: string, status?: string) {
    return this.prisma.stickerOrder.findMany({
      where: {
        businessId,
        ...(status && status !== 'all' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            sticker: {
              include: { country: { select: { name: true, flag: true, code: true } } },
            },
          },
        },
      },
    });
  }

  async updateOrderStatus(businessId: string, orderId: string, status: string) {
    const valid = ['pending', 'confirmed', 'delivered', 'cancelled'];
    if (!valid.includes(status)) throw new BadRequestException('Estado inválido');

    const order = await this.prisma.stickerOrder.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

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
        include: {
          items: {
            include: {
              sticker: { include: { country: { select: { name: true, flag: true } } } },
            },
          },
        },
      });
    });
  }

  async deleteOrder(businessId: string, orderId: string) {
    const order = await this.prisma.stickerOrder.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

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
