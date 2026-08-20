import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConsignmentService } from './consignment.service';

type User = { businessId: string };

@Controller('consignment')
@UseGuards(JwtAuthGuard)
export class ConsignmentController {
  constructor(private consignment: ConsignmentService) {}

  @Get('parties')
  list(@CurrentUser() user: User) {
    return this.consignment.listParties(user.businessId);
  }

  @Post('parties')
  create(
    @CurrentUser() user: User,
    @Body()
    body: {
      name: string;
      notes?: string;
      defaultCommissionPercent?: number;
      commissionBase?: 'cost' | 'sale';
    },
  ) {
    return this.consignment.createParty(user.businessId, body);
  }

  @Get('parties/:id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.consignment.getParty(id, user.businessId);
  }

  @Patch('parties/:id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      notes: string | null;
      defaultCommissionPercent: number;
      commissionBase: 'cost' | 'sale';
      active: boolean;
    }>,
  ) {
    return this.consignment.updateParty(id, user.businessId, body);
  }

  @Post('parties/:id/payment')
  pay(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string },
  ) {
    return this.consignment.addPayment(id, user.businessId, body.amount, body.note);
  }

  @Post('products/:productId/assign')
  assign(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
    @Body()
    body: {
      consigned: boolean;
      consignmentPartyId?: string | null;
      consignmentCommissionPercent?: number | null;
    },
  ) {
    return this.consignment.assignProduct(user.businessId, productId, body);
  }
}
