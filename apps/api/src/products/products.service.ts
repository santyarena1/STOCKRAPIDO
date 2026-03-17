import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Descuenta stock por lotes (FIFO por vencimiento). Si no hay lotes, descuenta del stock total (legacy).
   */
  async deductStockFromBatches(productId: string, businessId: string, qty: number): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new BadRequestException('Producto no encontrado');
    if (!product.stockControl || qty <= 0) return;
    const batches = await this.prisma.productBatch.findMany({
      where: { productId, businessId, qty: { gt: 0 } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (batches.length === 0) {
      const newStock = Math.max(0, product.stock - qty);
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });
      return;
    }
    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty, remaining);
      remaining -= deduct;
      const newQty = batch.qty - deduct;
      if (newQty <= 0) {
        await this.prisma.productBatch.delete({ where: { id: batch.id } });
      } else {
        await this.prisma.productBatch.update({
          where: { id: batch.id },
          data: { qty: newQty },
        });
      }
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: qty } },
    });
  }

  async search(businessId: string, q: string, limit = 20) {
    const term = q.trim();
    if (!term) return [];
    const byBarcode = await this.prisma.product.findMany({
      where: { businessId, barcode: term, isActive: true },
      take: 1,
      include: { category: true },
    });
    if (byBarcode.length) return byBarcode;
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { name: { contains: term } },
          { barcode: { contains: term } },
        ],
      },
      take: limit,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(businessId: string, categoryId?: string, lowStock?: boolean) {
    const where: Record<string, unknown> = { businessId, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    let list = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    if (lowStock)
      list = list.filter((p: { stockControl: boolean; stock: number; minStock: number }) => p.stockControl && p.stock <= p.minStock);
    return list;
  }

  async create(businessId: string, data: {
    name: string;
    barcode?: string;
    categoryId?: string;
    cost?: number;
    price: number;
    stock?: number;
    minStock?: number;
    stockControl?: boolean;
    brand?: string;
    iva?: number;
    expiresAt?: string;
  }) {
    return this.prisma.product.create({
      data: {
        businessId,
        name: data.name,
        barcode: data.barcode,
        categoryId: data.categoryId,
        cost: data.cost != null ? new Decimal(data.cost) : null,
        price: new Decimal(data.price),
        stock: data.stock ?? 0,
        minStock: data.minStock ?? 0,
        stockControl: data.stockControl ?? true,
        brand: data.brand,
        iva: data.iva != null ? new Decimal(data.iva) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: { category: true },
    });
  }

  async update(id: string, businessId: string, data: Partial<{
    name: string;
    barcode: string;
    categoryId: string;
    cost: number;
    price: number;
    minStock: number;
    stockControl: boolean;
    isActive: boolean;
    brand: string;
    iva: number;
    expiresAt: string;
  }>) {
    const update: Record<string, unknown> = { ...data };
    if (data.cost != null) update.cost = new Decimal(data.cost);
    if (data.price != null) update.price = new Decimal(data.price);
    if (data.iva != null) update.iva = new Decimal(data.iva);
    if (data.expiresAt != null) update.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    return this.prisma.product.update({
      where: { id, businessId },
      data: update,
      include: { category: true },
    });
  }

  async adjustStock(id: string, businessId: string, qty: number, reason: string, reference?: string) {
    const product = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!product) return null;
    await this.prisma.stockMove.create({
      data: { productId: id, qty, reason, reference },
    });
    if (qty < 0) {
      await this.deductStockFromBatches(id, businessId, Math.abs(qty));
    } else {
      await this.prisma.productBatch.create({
        data: {
          productId: id,
          businessId,
          qty,
          unitCost: product.cost ?? new Decimal(0),
          purchaseItemId: null,
        },
      });
      await this.prisma.product.update({
        where: { id },
        data: { stock: { increment: qty } },
      });
    }
    return this.prisma.product.findFirst({
      where: { id, businessId },
      include: { category: true, batches: true },
    });
  }

  async getOne(id: string, businessId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        category: true,
        batches: { orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!p) return null;
    return p;
  }

  async getAllStockMoves(businessId: string, limit = 100) {
    const products = await this.prisma.product.findMany({
      where: { businessId },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    return this.prisma.stockMove.findMany({
      where: { productId: { in: ids } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, barcode: true } } },
    });
  }

  async getStockMoves(productId: string, businessId: string, limit = 50) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) return [];
    return this.prisma.stockMove.findMany({
      where: { productId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Exporta Excel con ExcelJS (formato estándar que Excel abre sin problemas). */
  async exportStockExcel(businessId: string): Promise<Buffer> {
    const list = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock productos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'id', key: 'id', width: 28 },
      { header: 'codigo_barras', key: 'codigo_barras', width: 18 },
      { header: 'nombre', key: 'nombre', width: 32 },
      { header: 'categoria', key: 'categoria', width: 18 },
      { header: 'precio', key: 'precio', width: 10 },
      { header: 'costo', key: 'costo', width: 10 },
      { header: 'stock_actual', key: 'stock_actual', width: 14 },
      { header: 'stock_minimo', key: 'stock_minimo', width: 12 },
      { header: 'marca', key: 'marca', width: 14 },
      { header: 'control_stock', key: 'control_stock', width: 12 },
      { header: 'vencimiento', key: 'vencimiento', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of list) {
      ws.addRow({
        id: p.id,
        codigo_barras: p.barcode ?? '',
        nombre: p.name,
        categoria: p.category?.name ?? '',
        precio: Number(p.price),
        costo: p.cost != null ? Number(p.cost) : '',
        stock_actual: p.stock,
        stock_minimo: p.minStock,
        marca: p.brand ?? '',
        control_stock: p.stockControl ? 'Sí' : 'No',
        vencimiento: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '',
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
  }

  /** Parsea Excel y devuelve filas para importar (id/barcode, stock, minStock). */
  parseExcelStock(buffer: Buffer): Array<{ id?: string; barcode?: string; stock: number; minStock?: number }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const ws = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
    if (rows.length < 2) return [];
    const headerRow = rows[0].map((h) => String(h).toLowerCase().trim().replace(/\s+/g, '_'));
    const idCol = headerRow.indexOf('id');
    const barcodeCol = headerRow.indexOf('codigo_barras') >= 0 ? headerRow.indexOf('codigo_barras') : headerRow.indexOf('barcode');
    const stockCol = headerRow.indexOf('stock_actual') >= 0 ? headerRow.indexOf('stock_actual') : headerRow.indexOf('stock');
    const minStockCol = headerRow.indexOf('stock_minimo') >= 0 ? headerRow.indexOf('stock_minimo') : -1;
    if (stockCol === -1 || (idCol === -1 && barcodeCol === -1)) return [];
    const out: Array<{ id?: string; barcode?: string; stock: number; minStock?: number }> = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as (string | number)[];
      const id = idCol >= 0 ? String(row[idCol] ?? '').trim() : undefined;
      const barcode = barcodeCol >= 0 ? String(row[barcodeCol] ?? '').trim() : undefined;
      if (!id && !barcode) continue;
      const stockNum = Number(row[stockCol]);
      const stock = Number.isNaN(stockNum) || stockNum < 0 ? 0 : Math.floor(stockNum);
      const minStockNum = minStockCol >= 0 ? Number(row[minStockCol]) : undefined;
      const minStock = minStockNum !== undefined && !Number.isNaN(minStockNum) && minStockNum >= 0 ? Math.floor(minStockNum) : undefined;
      out.push({ id: id || undefined, barcode: barcode || undefined, stock, minStock });
    }
    return out;
  }

  /** Importa stock (y opcionalmente stock_minimo) desde filas Excel. */
  async importStock(
    businessId: string,
    rows: Array<{ id?: string; barcode?: string; stock: number; minStock?: number }>,
  ): Promise<{ updated: number; errors: Array<{ row: number; message: string }> }> {
    const errors: Array<{ row: number; message: string }> = [];
    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const stock = Number(row.stock);
      if (Number.isNaN(stock) || stock < 0) {
        errors.push({ row: i + 1, message: 'Stock inválido' });
        continue;
      }
      const where: { businessId: string; id?: string; barcode?: string } = { businessId };
      if (row.id) where.id = row.id;
      else if (row.barcode != null && String(row.barcode).trim() !== '') where.barcode = String(row.barcode).trim();
      else {
        errors.push({ row: i + 1, message: 'Falta id o codigo_barras' });
        continue;
      }
      const product = await this.prisma.product.findFirst({ where });
      if (!product) {
        errors.push({ row: i + 1, message: 'Producto no encontrado' });
        continue;
      }
      try {
        const delta = stock - product.stock;
        if (delta !== 0) {
          await this.adjustStock(product.id, businessId, delta, 'Importación masiva', `Fila ${i + 1}`);
        }
        if (row.minStock !== undefined && row.minStock !== product.minStock) {
          await this.prisma.product.update({
            where: { id: product.id, businessId },
            data: { minStock: row.minStock },
          });
        }
        updated++;
      } catch {
        errors.push({ row: i + 1, message: 'Error al actualizar' });
      }
    }
    return { updated, errors };
  }
}
