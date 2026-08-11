import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductBulkInput, ProductCatalogQuery, ProductsService } from './products.service';

type User = { businessId: string };

const CATALOG_SORTS = ['name', 'price', 'cost', 'stock', 'updatedAt', 'brand', 'category'] as const;
const CATALOG_STATUSES = ['active', 'inactive', 'all'] as const;

function optionalBoolean(value: string | undefined, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(`${field} debe ser 'true' o 'false'.`);
}

function positiveInteger(value: string | undefined, fallback: number, field: string, max?: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
    throw new BadRequestException(`${field} debe ser un entero entre 1 y ${max ?? 'infinito'}.`);
  }
  return parsed;
}

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get('search')
  search(
    @CurrentUser() user: User,
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('excludeCombos') excludeCombos?: string,
    @Query('excludeCategoryIds') excludeCategoryIds?: string,
  ) {
    return this.products.search(
      user.businessId,
      q || '',
      limit ? parseInt(limit, 10) : 20,
      excludeCombos === '1' || excludeCombos === 'true',
      excludeCategoryIds
        ? [...new Set(excludeCategoryIds.split(',').map((id) => id.trim()).filter(Boolean))]
        : [],
    );
  }

  @Get('catalog')
  catalog(
    @CurrentUser() user: User,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('excludeCategoryIds') excludeCategoryIds?: string,
    @Query('brand') brand?: string,
    @Query('provider') provider?: string,
    @Query('type') type?: string,
    @Query('subcategory') subcategory?: string,
    @Query('presentation') presentation?: string,
    @Query('stockControl') stockControl?: string,
    @Query('status') status?: string,
    @Query('hasStock') hasStock?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedStatus = status ?? 'active';
    if (!CATALOG_STATUSES.includes(parsedStatus as (typeof CATALOG_STATUSES)[number])) {
      throw new BadRequestException('status debe ser active, inactive o all.');
    }
    const parsedSort = sort ?? 'name';
    if (!CATALOG_SORTS.includes(parsedSort as (typeof CATALOG_SORTS)[number])) {
      throw new BadRequestException('Orden de catálogo inválido.');
    }
    if (dir !== undefined && dir !== 'asc' && dir !== 'desc') {
      throw new BadRequestException("dir debe ser 'asc' o 'desc'.");
    }
    const query: ProductCatalogQuery = {
      q,
      categoryId,
      excludeCategoryIds: excludeCategoryIds?.split(',').map((id) => id.trim()).filter(Boolean),
      brand,
      provider,
      type,
      subcategory,
      presentation,
      stockControl: optionalBoolean(stockControl, 'stockControl'),
      status: parsedStatus as ProductCatalogQuery['status'],
      hasStock: optionalBoolean(hasStock, 'hasStock'),
      sort: parsedSort as ProductCatalogQuery['sort'],
      dir: (dir ?? 'asc') as ProductCatalogQuery['dir'],
      page: positiveInteger(page, 1, 'page'),
      pageSize: positiveInteger(pageSize, 50, 'pageSize', 200),
    };
    return this.products.catalog(user.businessId, query);
  }

  @Get('facets')
  facets(@CurrentUser() user: User) {
    return this.products.facets(user.businessId);
  }

  @Post('bulk')
  bulk(@CurrentUser() user: User, @Body() body: ProductBulkInput) {
    return this.products.bulk(user.businessId, body);
  }

  @Post('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="productos-seleccionados.csv"')
  exportSelected(@CurrentUser() user: User, @Body() body: { ids: string[] }) {
    return this.products.exportSelectedCsv(user.businessId, body?.ids);
  }

  @Post('quick')
  quick(
    @CurrentUser() user: User,
    @Body() body: { name: string; price: number; barcode?: string },
  ) {
    return this.products.quick(user.businessId, body);
  }

  @Get('incomplete')
  incomplete(@CurrentUser() user: User) {
    return this.products.incomplete(user.businessId);
  }

  @Get('duplicates')
  duplicates(@CurrentUser() user: User) {
    return this.products.duplicates(user.businessId);
  }

  @Post('duplicates/merge')
  mergeDuplicates(
    @CurrentUser() user: User,
    @Body() body: { keepId: string; mergeIds: string[] },
  ) {
    return this.products.mergeDuplicates(user.businessId, body?.keepId, body?.mergeIds);
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.products.list(user.businessId, categoryId, lowStock === 'true');
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.products.create(user.businessId, body as Parameters<ProductsService['create']>[1]);
  }

  @Get('stock-moves')
  getAllStockMoves(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    /** altas = solo creación de productos (alta + stock inicial) */
    @Query('kind') kind?: string,
  ) {
    const k = kind === 'altas' ? 'altas' : 'all';
    const n = limit ? parseInt(limit, 10) : 300;
    return this.products.getAllStockMoves(user.businessId, Number.isFinite(n) && n > 0 ? n : 300, k);
  }

  @Get('export-stock')
  async exportStock(@CurrentUser() user: User) {
    const buffer = await this.products.exportStockExcel(user.businessId);
    const filename = `stock-productos-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { filename, content: buffer.toString('base64') };
  }

  @Post('import-stock')
  @UseInterceptors(FileInterceptor('file'))
  async importStock(
    @CurrentUser() user: User,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file?.buffer) throw new BadRequestException('Subí un archivo Excel (.xlsx)');
    const rows = this.products.parseExcelStock(file.buffer);
    if (rows.length === 0) throw new BadRequestException('El Excel no tiene filas válidas. Usá el archivo exportado como plantilla.');
    return this.products.importStock(user.businessId, rows);
  }

  @Get(':id/supplier-data')
  getSupplierData(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.getSupplierData(id, user.businessId);
  }

  @Post('backfill-codes')
  backfillCodes(@CurrentUser() user: User) {
    return this.products.backfillAllCodes(user.businessId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.getOne(id, user.businessId);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.products.update(id, user.businessId, body as Parameters<ProductsService['update']>[2]);
  }

  @Post(':id/stock')
  adjustStock(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { qty: number; reason: string; reference?: string },
  ) {
    return this.products.adjustStock(id, user.businessId, body.qty, body.reason, body.reference);
  }

  @Get(':id/stock-moves')
  getStockMoves(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.products.getStockMoves(id, user.businessId, limit ? parseInt(limit, 10) : 50);
  }
}
