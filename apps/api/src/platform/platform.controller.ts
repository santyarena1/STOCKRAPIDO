import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlatformService } from './platform.service';
import { SupportService } from '../support/support.service';
import { TicketMessageDto } from '../support/dto/ticket.dto';
import { UpdateBusinessPlanDto, UpdateTicketStatusDto, UpsertPlatformSellerDto, UpdatePlatformSellerDto, SellerLedgerDto, AssignSellerBusinessDto } from './dto/platform.dto';
import { PlatformSellersService } from '../billing/sellers.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(
    private platform: PlatformService,
    private support: SupportService,
    private sellers: PlatformSellersService,
  ) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('businesses')
  list(@Query('q') q?: string, @Query('status') status?: string) {
    return this.platform.listBusinesses(q, status);
  }

  @Get('businesses/:id')
  get(@Param('id') id: string) {
    return this.platform.getBusiness(id);
  }

  @Patch('businesses/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBusinessPlanDto) {
    return this.platform.updateBusiness(id, dto);
  }

  @Post('invoices/:id/mark-paid')
  markPaid(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.platform.markInvoicePaid(id, body?.notes);
  }

  @Post('invoices/:id/void')
  voidInvoice(@Param('id') id: string) {
    return this.platform.voidInvoice(id);
  }

  @Patch('users/:id/platform-admin')
  setAdmin(@Param('id') id: string, @Body() body: { isPlatformAdmin: boolean }) {
    return this.platform.setUserPlatformAdmin(id, Boolean(body.isPlatformAdmin));
  }

  @Get('tickets')
  tickets(@Query('status') status?: string) {
    return this.support.listAll(status);
  }

  @Get('tickets/:id')
  ticket(@Param('id') id: string) {
    return this.support.getAny(id);
  }

  @Post('tickets/:id/reply')
  reply(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: TicketMessageDto) {
    return this.support.replyAsStaff(user, id, dto.body);
  }

  @Patch('tickets/:id')
  updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.support.updateStatus(id, dto);
  }

  @Get('sellers')
  listSellers() {
    return this.sellers.list();
  }

  @Post('sellers')
  createSeller(@Body() dto: UpsertPlatformSellerDto) {
    return this.sellers.create(dto);
  }

  @Get('sellers/:id')
  getSeller(@Param('id') id: string) {
    return this.sellers.get(id);
  }

  @Patch('sellers/:id')
  updateSeller(@Param('id') id: string, @Body() dto: UpdatePlatformSellerDto) {
    return this.sellers.update(id, dto);
  }

  @Post('sellers/:id/ledger')
  addSellerLedger(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SellerLedgerDto,
  ) {
    return this.sellers.addLedger(id, dto, user.id);
  }

  @Post('sellers/:id/assign')
  assignSellerBusiness(@Param('id') id: string, @Body() dto: AssignSellerBusinessDto) {
    return this.sellers.assignBusiness(id, dto.businessId);
  }
}
