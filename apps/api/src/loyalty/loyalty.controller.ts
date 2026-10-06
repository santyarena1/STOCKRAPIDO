import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/guards/tenant.guards';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyWalletService } from './loyalty-wallet.service';

type Staff = { id: string; businessId: string; role: string };

@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(
    private loyalty: LoyaltyService,
    private wallet: LoyaltyWalletService,
  ) {}

  @Get('config')
  config(@CurrentUser() user: Staff) {
    return this.loyalty.getConfig(user.businessId);
  }

  @Put('config')
  @Roles('OWNER', 'ADMIN')
  saveConfig(@CurrentUser() user: Staff, @Body() body: Record<string, unknown>) {
    return this.loyalty.saveConfig(user.businessId, '', body as never);
  }

  @Get('pos')
  pos(@CurrentUser() user: Staff) {
    return this.loyalty.posContext(user.businessId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: Staff) {
    return this.loyalty.dashboard(user.businessId);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: Staff, @Query('q') q?: string) {
    return this.loyalty.listAccounts(user.businessId, q);
  }

  @Get('accounts/:id')
  account(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.getAccount(user.businessId, id);
  }

  @Post('accounts/:id/adjust')
  @Roles('OWNER', 'ADMIN')
  adjust(
    @CurrentUser() user: Staff,
    @Param('id') id: string,
    @Body() body: { pointsDelta: number; reason: string },
  ) {
    return this.loyalty.adjust(user.businessId, user.id, id, body.pointsDelta, body.reason);
  }

  @Post('accounts/:id/reset-pin')
  @Roles('OWNER', 'ADMIN')
  resetPin(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.resetPin(user.businessId, user.id, id);
  }

  @Post('accounts/:id/wallet-sync')
  @Roles('OWNER', 'ADMIN')
  sync(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.syncWallet(id).then(() => this.loyalty.getAccount(user.businessId, id));
  }

  @Get('checkins')
  checkins(@CurrentUser() user: Staff) {
    return this.loyalty.listCheckins(user.businessId);
  }

  @Post('checkins/:id/cancel')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  cancelCheckin(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.cancelCheckin(user.businessId, id);
  }

  @Post('cards/lookup')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  lookup(@CurrentUser() user: Staff, @Body() body: { token: string }) {
    return this.loyalty.lookupCard(user.businessId, body.token || '');
  }

  @Post('preview')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  preview(
    @CurrentUser() user: Staff,
    @Body() body: { accountId: string; total: number; points?: number },
  ) {
    return this.loyalty.preview(user.businessId, body.accountId, body.total, body.points || 0);
  }

  @Get('topups')
  topups(@CurrentUser() user: Staff) {
    return this.loyalty.listTopups(user.businessId);
  }

  @Post('topups/:id/approve')
  @Roles('OWNER', 'ADMIN')
  approve(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.approveTopup(user.businessId, user.id, id);
  }

  @Post('topups/:id/reject')
  @Roles('OWNER', 'ADMIN')
  reject(@CurrentUser() user: Staff, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.loyalty.rejectTopup(user.businessId, user.id, id, body?.reason);
  }

  @Get('rewards')
  rewards(@CurrentUser() user: Staff) {
    return this.loyalty.listRewards(user.businessId);
  }

  @Post('rewards')
  @Roles('OWNER', 'ADMIN')
  createReward(@CurrentUser() user: Staff, @Body() body: Record<string, unknown>) {
    return this.loyalty.saveReward(user.businessId, body as never);
  }

  @Patch('rewards/:id')
  @Roles('OWNER', 'ADMIN')
  updateReward(@CurrentUser() user: Staff, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.loyalty.saveReward(user.businessId, { ...body, id } as never);
  }

  @Get('redemptions')
  redemptions(@CurrentUser() user: Staff) {
    return this.loyalty.listRedemptions(user.businessId);
  }

  @Post('redemptions/:id/deliver')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  deliver(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.deliverRedemption(user.businessId, user.id, id);
  }

  @Post('redemptions/:id/cancel')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  cancelRedemption(@CurrentUser() user: Staff, @Param('id') id: string) {
    return this.loyalty.cancelRedemption(user.businessId, user.id, id);
  }

  @Get('rules')
  rules(@CurrentUser() user: Staff) {
    return this.loyalty.listRules(user.businessId);
  }

  @Post('rules')
  @Roles('OWNER', 'ADMIN')
  createRule(@CurrentUser() user: Staff, @Body() body: Record<string, unknown>) {
    return this.loyalty.saveRule(user.businessId, body as never);
  }

  @Patch('rules/:id')
  @Roles('OWNER', 'ADMIN')
  updateRule(@CurrentUser() user: Staff, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.loyalty.saveRule(user.businessId, { ...body, id } as never);
  }

  @Get('qr')
  qr(@CurrentUser() user: Staff) {
    return this.loyalty.qr(user.businessId);
  }

  @Post('sales/:saleId/claim-token')
  @Roles('OWNER', 'ADMIN', 'CAJERO')
  claimToken(@CurrentUser() user: Staff, @Param('saleId') saleId: string) {
    return this.loyalty.issueClaimToken(user.businessId, saleId);
  }

  @Get('wallet/status')
  walletStatus() {
    return this.wallet.status();
  }
}
