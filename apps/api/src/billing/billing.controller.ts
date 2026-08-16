import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/subscribe.dto';

type AuthUser = { id: string; role: string; businessId: string };

@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.billing.getMe(user.businessId);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(user, dto);
  }

  @Get('mp/webhook')
  webhookGet(@Query() query: Record<string, string | undefined>, @Req() req: { query: Record<string, string> }) {
    return this.billing.handleMercadoPagoWebhook({ ...req.query, ...query }, {});
  }

  @Post('mp/webhook')
  webhook(@Query() query: Record<string, string | undefined>, @Body() body: Record<string, unknown>, @Req() req: { query: Record<string, string> }) {
    return this.billing.handleMercadoPagoWebhook({ ...req.query, ...query }, body || {});
  }
}
