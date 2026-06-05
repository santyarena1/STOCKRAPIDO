import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { NormalizedItem } from './mondelez.provider';

type User = { businessId: string };

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  // ----- Conexiones (requieren login) -----
  @Get('connections')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() u: User) {
    return this.sync.listConnections(u.businessId);
  }

  @Post('connections')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() u: User, @Body() body: any) {
    return this.sync.createConnection(u.businessId, body);
  }

  @Patch('connections/:id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() u: User, @Param('id') id: string, @Body() body: any) {
    return this.sync.updateConnection(id, u.businessId, body);
  }

  @Delete('connections/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.deleteConnection(id, u.businessId);
  }

  // ----- Sync de catálogo público (server-side) -----
  @Post('connections/:id/run')
  @UseGuards(JwtAuthGuard)
  run(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.runCatalogSync(id, u.businessId);
  }

  // ----- Listados -----
  @Get('connections/:id/products')
  @UseGuards(JwtAuthGuard)
  products(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('onlyAvailable') onlyAvailable?: string,
    @Query('onlyWithCost') onlyWithCost?: string,
  ) {
    return this.sync.listSyncedProducts(id, u.businessId, {
      q,
      onlyAvailable: onlyAvailable === 'true',
      onlyWithCost: onlyWithCost === 'true',
    });
  }

  @Get('connections/:id/runs')
  @UseGuards(JwtAuthGuard)
  runs(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.listRuns(id, u.businessId);
  }

  // ----- Mapeo de columnas (proveedor -> producto) -----
  @Get('connections/:id/mapping')
  @UseGuards(JwtAuthGuard)
  getMapping(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getMappingInfo(id, u.businessId);
  }

  @Patch('connections/:id/mapping')
  @UseGuards(JwtAuthGuard)
  setMapping(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { mapping: Record<string, string> }) {
    return this.sync.setMapping(id, u.businessId, body?.mapping || {});
  }

  // ----- Importar a productos del negocio -----
  @Post('connections/:id/import')
  @UseGuards(JwtAuthGuard)
  import(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { onlyWithCost?: boolean; onlyAvailable?: boolean },
  ) {
    return this.sync.importToProducts(id, u.businessId, body || {});
  }

  // ----- Push desde el RUNNER autenticado (precios reales + todos los campos) -----
  @Post('connections/:id/push')
  @UseGuards(JwtAuthGuard)
  push(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { items: NormalizedItem[] },
  ) {
    return this.sync.pushItems(id, u.businessId, body?.items || []);
  }

  // ----- Cron de Vercel: sync automático de catálogo (sin JWT, con secreto) -----
  // Vercel Cron hace GET y agrega "Authorization: Bearer <CRON_SECRET>".
  @Get('cron')
  cron(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      throw new ForbiddenException('cron secret inválido');
    }
    return this.sync.runAllAuto();
  }
}
