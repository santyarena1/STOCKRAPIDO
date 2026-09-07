import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { ProductsService } from '../products/products.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { ConsignmentService } from '../consignment/consignment.service';
import { createHash } from 'crypto';

export type SaleItemInput =
  | { productId: string; qty: number; unitPrice: number; silentTicket?: boolean }
  | { productId?: string; name?: string; qty: number; unitPrice: number; silentTicket?: boolean };

/** Ventana anti-duplicado al crear: cobros idénticos en pocos segundos = el mismo cobro. */
const DEDUPE_WINDOW_MS = 8_000;

function moneyKey(n: number) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function itemFingerprint(items: SaleItemInput[]) {
  return items
    .map((i) => {
      const isManual = !i.productId || String(i.productId).startsWith('manual-');
      const key = isManual
        ? `m:${((i as { name?: string }).name || 'Producto manual').trim().toLowerCase()}`
        : `p:${(i as { productId: string }).productId}`;
      return `${key}|${i.qty}|${moneyKey(i.unitPrice)}`;
    })
    .sort()
    .join(';');
}

function saleFingerprint(input: {
  paymentMethod?: string | null;
  discount: number;
  totalFinal: number;
  customerId?: string | null;
  sellerId?: string | null;
  items: SaleItemInput[];
}) {
  return [
    input.paymentMethod || '',
    moneyKey(input.discount),
    moneyKey(input.totalFinal),
    input.customerId || '',
    input.sellerId || '',
    itemFingerprint(input.items),
  ].join('#');
}

function storedItemsFingerprint(
  items: Array<{ productId: string | null; productName: string | null; qty: number; unitPrice: unknown }>,
) {
  return items
    .map((i) => {
      const key = i.productId ? `p:${i.productId}` : `m:${(i.productName || 'Producto manual').trim().toLowerCase()}`;
      return `${key}|${i.qty}|${moneyKey(Number(i.unitPrice))}`;
    })
    .sort()
    .join(';');
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
    private fiscal: FiscalService,
    private consignment: ConsignmentService,
  ) {}

  async create(
    businessId: string,
    userId: string,
    items: SaleItemInput[],
    options?: {
      customerId?: string;
      discount?: number;
      paymentMethod?: string;
      cashRegisterId?: string;
      fiscalMode?: 'internal' | 'factura_c';
      sellerId?: string;
      orderSource?: string;
      externalOrderId?: string;
      clientRequestId?: string;
    },
  ) {
    if (!items?.length) {
      throw new BadRequestException('La venta no tiene ítems.');
    }

    let cashRegisterId = options?.cashRegisterId?.trim();
    if (!cashRegisterId) {
      throw new BadRequestException('Tenés que tener la caja abierta para registrar ventas.');
    }
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, businessId, closedAt: null },
    });
    if (!reg) throw new BadRequestException('Caja no encontrada o cerrada. Abrí caja desde el menú Caja.');
    if (options?.sellerId) {
      const seller = await this.prisma.vendedor.findFirst({
        where: { id: options.sellerId, businessId, active: true },
        select: { id: true },
      });
      if (!seller) throw new BadRequestException('El vendedor seleccionado no existe o está inactivo.');
    }

    const discount = options?.discount ?? 0;
    let total = 0;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { posConfig: true },
    });
    const posConfig =
      business?.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>)
        : {};
    const silentLabel =
      (typeof posConfig.silentItemLabel === 'string' && posConfig.silentItemLabel.trim()) || 'Item kiosco';

    const saleItems = items.map((i) => {
      const subtotal = i.qty * i.unitPrice;
      total += subtotal;
      const isManual = !i.productId || String(i.productId).startsWith('manual-');
      const silentTicket = Boolean((i as { silentTicket?: boolean }).silentTicket);
      return {
        productId: isManual ? null : (i as { productId: string }).productId,
        // Cart-only silent: guardamos el label en productName (con productId) para el ticket.
        productName: isManual
          ? ((i as { name?: string }).name || 'Producto manual')
          : silentTicket
            ? silentLabel
            : null,
        qty: i.qty,
        unitPrice: new Decimal(i.unitPrice),
        subtotal: new Decimal(subtotal),
      };
    });
    const totalFinal = total - discount;
    const clientRequestId = options?.clientRequestId?.trim() || null;
    const fingerprint = saleFingerprint({
      paymentMethod: options?.paymentMethod,
      discount,
      totalFinal,
      customerId: options?.customerId,
      sellerId: options?.sellerId,
      items,
    });

    // Pedidos externos: no duplicar el mismo pedido de Rappi/PedidosYa.
    if (options?.orderSource && options?.externalOrderId) {
      const byExternal = await this.prisma.sale.findFirst({
        where: {
          businessId,
          orderSource: options.orderSource,
          externalOrderId: options.externalOrderId,
          status: 'completed',
        },
        orderBy: { createdAt: 'asc' },
      });
      if (byExternal) {
        const existing = await this.getOne(byExternal.id, businessId);
        if (!existing) throw new NotFoundException('Venta no encontrada');
        return existing;
      }
    }

    // Serializa cobros concurrentes con la misma huella (anti doble-submit).
    const lockKey = createHash('sha256')
      .update(`${businessId}|${userId}|${fingerprint}`)
      .digest();
    const lockA = lockKey.readInt32BE(0);
    const lockB = lockKey.readInt32BE(4);

    const existingId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockA}, ${lockB})`;

      if (clientRequestId) {
        const byClient = await tx.sale.findFirst({
          where: { businessId, clientRequestId },
          select: { id: true },
        });
        if (byClient) return byClient.id;
      }

      const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
      const recent = await tx.sale.findMany({
        where: {
          businessId,
          userId,
          createdAt: { gte: since },
          status: 'completed',
          paymentMethod: options?.paymentMethod ?? null,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          items: { select: { productId: true, productName: true, qty: true, unitPrice: true } },
        },
      });

      for (const sale of recent) {
        if (moneyKey(Number(sale.totalFinal)) !== moneyKey(totalFinal)) continue;
        if (moneyKey(Number(sale.discount)) !== moneyKey(discount)) continue;
        if ((sale.customerId || null) !== (options?.customerId || null)) continue;
        if ((sale.sellerId || null) !== (options?.sellerId || null)) continue;
        if (storedItemsFingerprint(sale.items) !== itemFingerprint(items)) continue;
        return sale.id;
      }

      try {
        const created = await tx.sale.create({
          data: {
            businessId,
            userId,
            customerId: options?.customerId,
            total: new Decimal(total),
            discount: new Decimal(discount),
            totalFinal: new Decimal(totalFinal),
            paymentMethod: options?.paymentMethod,
            cashRegisterId,
            sellerId: options?.sellerId ?? null,
            orderSource: options?.orderSource ?? null,
            externalOrderId: options?.externalOrderId ?? null,
            clientRequestId,
            items: { create: saleItems },
          },
          select: { id: true },
        });
        return `new:${created.id}`;
      } catch (err) {
        // Carrera residual con el mismo clientRequestId: devolver la venta ya creada.
        if (clientRequestId) {
          const byClient = await tx.sale.findFirst({
            where: { businessId, clientRequestId },
            select: { id: true },
          });
          if (byClient) return byClient.id;
        }
        throw err;
      }
    });

    if (!existingId.startsWith('new:')) {
      // Mismo cobro reenviado: devolver la venta ya persistida (sin volver a descontar stock).
      const existing = await this.getOne(existingId, businessId);
      if (!existing) throw new NotFoundException('Venta no encontrada');
      return existing;
    }

    const saleId = existingId.slice(4);
    const sale = await this.prisma.sale.findFirstOrThrow({
      where: { id: saleId, businessId },
      include: { items: { include: { product: true } }, customer: true },
    });

    // Todo lo que sigue es post-persistencia: si falla, la venta YA existe.
    // Nunca devolvemos 500 después de crear la venta (evita “error” fantasma en el POS).
    try {
      for (const item of items) {
        const isManual = !item.productId || String(item.productId).startsWith('manual-');
        if (!isManual && item.productId) {
          await this.products.deductStockFromBatches(item.productId, businessId, item.qty);
          await this.prisma.stockMove.create({
            data: {
              productId: item.productId,
              qty: -item.qty,
              reason: 'venta',
              reference: sale.id,
            },
          });
        }
      }
    } catch (err) {
      console.error('[sales.create] stock post-venta', sale.id, err);
    }

    try {
      if (options?.customerId && options?.paymentMethod === 'fiado') {
        await this.prisma.customer.update({
          where: { id: options.customerId },
          data: { balance: { increment: totalFinal } },
        });
      }
    } catch (err) {
      console.error('[sales.create] fiado balance', sale.id, err);
    }

    try {
      await this.consignment.recordSaleDebts(
        businessId,
        sale.id,
        sale.items.map((it) => ({ id: it.id, productId: it.productId, qty: it.qty })),
      );
    } catch (err) {
      console.error('[sales.create] consignment', sale.id, err);
    }

    let fiscalDocument: Awaited<ReturnType<FiscalService['createInternal']>> | null = null;
    try {
      fiscalDocument =
        options?.fiscalMode === 'factura_c'
          ? await this.fiscal.issueFacturaC(businessId, sale.id)
          : await this.fiscal.createInternal(businessId, sale.id);
    } catch (err) {
      console.error('[sales.create] fiscal', sale.id, err);
      try {
        fiscalDocument = await this.fiscal.createInternal(businessId, sale.id);
      } catch {
        fiscalDocument = null;
      }
    }

    return { ...sale, fiscalDocument };
  }

  async list(
    businessId: string,
    from?: Date,
    to?: Date,
    customerId?: string,
    limit = 50,
    productId?: string,
    fiscalKind?: 'FACTURA_C' | 'INTERNAL',
  ) {
    const where: Record<string, unknown> = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }
    if (customerId) where.customerId = customerId;
    const pid = productId?.trim();
    if (pid) where.items = { some: { productId: pid } };
    if (fiscalKind === 'FACTURA_C') {
      where.fiscalDocument = { kind: 'FACTURA_C', status: 'AUTHORIZED' };
    } else if (fiscalKind === 'INTERNAL') {
      where.OR = [
        { fiscalDocument: null },
        { fiscalDocument: { kind: 'INTERNAL' } },
      ];
    }
    return this.prisma.sale.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true } },
        user: { select: { name: true } },
        seller: { select: { name: true } },
        customer: true,
        fiscalDocument: true,
      },
    });
  }

  async getOne(id: string, businessId: string) {
    return this.prisma.sale.findFirst({
      where: { id, businessId },
      include: {
        items: { include: { product: true } },
        user: true,
        seller: { select: { name: true } },
        customer: true,
        fiscalDocument: true,
      },
    });
  }

  async deleteSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true, fiscalDocument: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.fiscalDocument?.kind === 'FACTURA_C' && sale.fiscalDocument.status === 'AUTHORIZED') {
      throw new BadRequestException('No podés eliminar una venta facturada. Anulala con nota de crédito.');
    }

    for (const it of sale.items) {
      if (it.productId && it.qty > 0) {
        await this.products.adjustStock(
          it.productId,
          businessId,
          it.qty,
          'correccion_venta',
          `anula-venta:${saleId}`,
        );
      }
    }

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { balance: { decrement: Number(sale.totalFinal) } },
      });
    }

    await this.consignment.voidSaleDebts(businessId, saleId);

    await this.prisma.sale.delete({ where: { id: saleId } });
    return { ok: true };
  }

  async voidSaleWithCreditNote(businessId: string, userId: string, saleId: string, reason?: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true, fiscalDocument: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'voided') throw new BadRequestException('La venta ya está anulada.');
    if (sale.fiscalDocument?.kind !== 'FACTURA_C' || sale.fiscalDocument.status !== 'AUTHORIZED') {
      throw new BadRequestException(
        'Solo se puede anular con nota de crédito una venta facturada. Para comprobantes internos usá Eliminar.',
      );
    }

    await this.fiscal.issueCreditNote(businessId, saleId);

    for (const item of sale.items) {
      if (item.productId && item.qty > 0) {
        await this.products.adjustStock(
          item.productId,
          businessId,
          item.qty,
          'anulacion_nc',
          `nota-credito:${saleId}`,
        );
      }
    }

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { balance: { decrement: Number(sale.totalFinal) } },
      });
    }

    await this.consignment.voidSaleDebts(businessId, saleId);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        voidedById: userId,
        voidReason: reason ?? null,
      },
    });
    return this.getOne(saleId, businessId);
  }

  async updateSale(
    businessId: string,
    saleId: string,
    dto: {
      discount?: number;
      paymentMethod?: string;
      customerId?: string | null;
    },
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    const oldFinal = Number(sale.totalFinal);
    const oldPayment = sale.paymentMethod;
    const oldCustomerId = sale.customerId;

    let discount = dto.discount !== undefined ? dto.discount : Number(sale.discount);
    if (discount < 0) throw new BadRequestException('Descuento inválido');

    const total = sale.items.reduce((s, i) => s + Number(i.subtotal), 0);
    if (discount > total) discount = total;
    const totalFinal = total - discount;

    const newPayment = dto.paymentMethod !== undefined ? dto.paymentMethod : oldPayment;
    const newCustomerId = dto.customerId !== undefined ? dto.customerId : oldCustomerId;

    if (oldPayment === 'fiado' && oldCustomerId) {
      await this.prisma.customer.update({
        where: { id: oldCustomerId },
        data: { balance: { decrement: oldFinal } },
      });
    }

    if (newPayment === 'fiado' && newCustomerId) {
      await this.prisma.customer.update({
        where: { id: newCustomerId },
        data: { balance: { increment: totalFinal } },
      });
    }

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        discount: new Decimal(discount),
        total: new Decimal(total),
        totalFinal: new Decimal(totalFinal),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
      },
    });

    return this.getOne(saleId, businessId);
  }

  async updateSaleItem(
    businessId: string,
    saleId: string,
    itemId: string,
    dto: { qty?: number; unitPrice?: number },
  ) {
    const item = await this.prisma.saleItem.findFirst({
      where: { id: itemId, saleId },
      include: { sale: true },
    });
    if (!item || item.sale.businessId !== businessId) throw new NotFoundException('Ítem no encontrado');

    const sale = item.sale;
    const oldQty = item.qty;
    const oldFinal = Number(sale.totalFinal);
    const newQty = dto.qty !== undefined ? dto.qty : oldQty;
    const newUnit = dto.unitPrice !== undefined ? dto.unitPrice : Number(item.unitPrice);

    if (newQty < 1) throw new BadRequestException('La cantidad debe ser al menos 1');
    if (newUnit < 0) throw new BadRequestException('Precio inválido');

    if (item.productId) {
      const delta = newQty - oldQty;
      if (delta > 0) {
        await this.products.deductStockFromBatches(item.productId, businessId, delta);
      } else if (delta < 0) {
        await this.products.adjustStock(
          item.productId,
          businessId,
          -delta,
          'correccion_venta',
          `venta:${saleId}`,
        );
      }
    }

    const newSubtotal = newQty * newUnit;
    await this.prisma.saleItem.update({
      where: { id: itemId },
      data: {
        qty: newQty,
        unitPrice: new Decimal(newUnit),
        subtotal: new Decimal(newSubtotal),
      },
    });

    const items = await this.prisma.saleItem.findMany({ where: { saleId } });
    const sumItems = items.reduce((s, i) => s + Number(i.subtotal), 0);
    const discount = Number(sale.discount);
    const totalFinal = Math.max(0, sumItems - discount);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        total: new Decimal(sumItems),
        totalFinal: new Decimal(totalFinal),
      },
    });

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      const deltaBal = totalFinal - oldFinal;
      if (deltaBal !== 0) {
        await this.prisma.customer.update({
          where: { id: sale.customerId },
          data: { balance: { increment: deltaBal } },
        });
      }
    }

    return this.getOne(saleId, businessId);
  }

  async deleteSaleItem(businessId: string, saleId: string, itemId: string) {
    const item = await this.prisma.saleItem.findFirst({
      where: { id: itemId, saleId },
      include: { sale: true },
    });
    if (!item || item.sale.businessId !== businessId) throw new NotFoundException('Ítem no encontrado');

    const sale = item.sale;
    const oldFinal = Number(sale.totalFinal);

    if (item.productId && item.qty > 0) {
      await this.products.adjustStock(
        item.productId,
        businessId,
        item.qty,
        'correccion_venta',
        `quita-item-venta:${saleId}`,
      );
    }

    await this.prisma.saleItem.delete({ where: { id: itemId } });

    const remaining = await this.prisma.saleItem.count({ where: { saleId } });
    if (remaining === 0) {
      if (sale.paymentMethod === 'fiado' && sale.customerId) {
        await this.prisma.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: oldFinal } },
        });
      }
      await this.prisma.sale.delete({ where: { id: saleId } });
      return { removed: true as const, saleDeleted: true };
    }

    const items = await this.prisma.saleItem.findMany({ where: { saleId } });
    const sumItems = items.reduce((s, i) => s + Number(i.subtotal), 0);
    const discount = Number(sale.discount);
    let adjDiscount = discount;
    if (adjDiscount > sumItems) adjDiscount = sumItems;
    const totalFinal = Math.max(0, sumItems - adjDiscount);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        total: new Decimal(sumItems),
        discount: new Decimal(adjDiscount),
        totalFinal: new Decimal(totalFinal),
      },
    });

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { balance: { increment: totalFinal - oldFinal } },
      });
    }

    return { removed: true as const, saleDeleted: false, sale: await this.getOne(saleId, businessId) };
  }

  async cleanupDuplicates(businessId: string, windowSeconds = 15): Promise<{ deleted: number; ids: string[] }> {
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        totalFinal: true,
        discount: true,
        paymentMethod: true,
        customerId: true,
        sellerId: true,
        createdAt: true,
        items: { select: { productId: true, productName: true, qty: true, unitPrice: true } },
      },
    });

    const toDelete = new Set<string>();
    for (let i = 0; i < sales.length; i++) {
      if (toDelete.has(sales[i].id)) continue;
      const fpI = storedItemsFingerprint(sales[i].items);
      for (let j = i + 1; j < sales.length; j++) {
        const diffSeconds = (sales[j].createdAt.getTime() - sales[i].createdAt.getTime()) / 1000;
        if (diffSeconds > windowSeconds) break;
        if (toDelete.has(sales[j].id)) continue;
        if (sales[j].userId !== sales[i].userId) continue;
        if (sales[j].paymentMethod !== sales[i].paymentMethod) continue;
        if (moneyKey(Number(sales[j].totalFinal)) !== moneyKey(Number(sales[i].totalFinal))) continue;
        if (moneyKey(Number(sales[j].discount)) !== moneyKey(Number(sales[i].discount))) continue;
        if ((sales[j].customerId || null) !== (sales[i].customerId || null)) continue;
        if ((sales[j].sellerId || null) !== (sales[i].sellerId || null)) continue;
        if (storedItemsFingerprint(sales[j].items) !== fpI) continue;
        toDelete.add(sales[j].id);
      }
    }

    const deleted: string[] = [];
    for (const id of toDelete) {
      try {
        await this.deleteSale(businessId, id);
        deleted.push(id);
      } catch { /* skip si ya fue borrada o hubo error */ }
    }
    return { deleted: deleted.length, ids: deleted };
  }
}
