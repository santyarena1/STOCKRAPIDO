import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PausedSalesService } from './paused-sales.service';

type User = { businessId: string; id: string };

@Controller('paused-sales')
@UseGuards(JwtAuthGuard)
export class PausedSalesController {
  constructor(private service: PausedSalesService) {}

  @Post()
  save(@CurrentUser() user: User, @Body() body: { items: unknown[]; discount?: number }) {
    return this.service.save(user.businessId, user.id, body);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.service.list(user.businessId, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.remove(id, user.businessId, user.id);
  }
}
