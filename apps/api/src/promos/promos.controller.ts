import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PromosService, PromoInput } from './promos.service';

type User = { businessId: string };

@Controller('promos')
@UseGuards(JwtAuthGuard)
export class PromosController {
  constructor(private promos: PromosService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('activeOnly') activeOnly?: string) {
    return this.promos.list(user.businessId, activeOnly === 'true');
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.promos.getOne(id, user.businessId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: PromoInput) {
    return this.promos.create(user.businessId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Partial<PromoInput>) {
    return this.promos.update(id, user.businessId, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.promos.delete(id, user.businessId);
  }
}
