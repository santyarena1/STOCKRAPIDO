import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CajaService } from './caja.service';

type User = { businessId: string; id: string };

@Controller('caja')
@UseGuards(JwtAuthGuard)
export class CajaController {
  constructor(private caja: CajaService) {}

  @Get('open')
  getOpen(@CurrentUser() user: User) {
    return this.caja.getOpen(user.businessId, user.id);
  }

  @Post('open')
  open(
    @CurrentUser() user: User,
    @Body() body: { openingCash: number; openingBank?: number; notes?: string },
  ) {
    return this.caja.open(user.businessId, user.id, body.openingCash, body.notes, body.openingBank);
  }

  @Post('movement')
  addMovement(
    @CurrentUser() user: User,
    @Body()
    body: {
      cashRegisterId: string;
      type: 'income' | 'expense';
      amount: number;
      /** efectivo = caja física; banco = cuenta bancaria / posición electrónica */
      channel: 'efectivo' | 'banco';
      note?: string;
      reference?: string;
    },
  ) {
    return this.caja.addMovement(
      user.businessId,
      body.cashRegisterId,
      body.type,
      body.amount,
      body.channel,
      body.note,
      body.reference,
    );
  }

  @Post('close')
  close(
    @CurrentUser() user: User,
    @Body()
    body: { cashRegisterId: string; counts: { channel: 'efectivo' | 'banco'; actual: number }[] },
  ) {
    return this.caja.close(user.businessId, body.cashRegisterId, body.counts);
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.caja.list(
      user.businessId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit ? parseInt(limit, 10) : 30,
    );
  }
}
