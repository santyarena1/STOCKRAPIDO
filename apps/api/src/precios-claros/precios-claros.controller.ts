import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PreciosClarosService } from './precios-claros.service';

@Controller('precios-claros')
@UseGuards(JwtAuthGuard)
export class PreciosClarosController {
  constructor(private readonly preciosClaros: PreciosClarosService) {}

  @Get('search')
  async search(@Query('ean') ean?: string, @Query('q') q?: string) {
    if (ean?.trim()) {
      const items = await this.preciosClaros.searchByEan(ean);
      return { items, source: 'precios-claros', mode: 'ean' as const };
    }
    if (q?.trim()) {
      const items = await this.preciosClaros.searchByName(q);
      return { items, source: 'precios-claros', mode: 'name' as const };
    }
    return { items: [], source: 'precios-claros', mode: 'empty' as const };
  }
}
