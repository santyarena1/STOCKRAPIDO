import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupportService } from './support.service';
import { CreateTicketDto, TicketMessageDto } from './dto/ticket.dto';

type AuthUser = { id: string; businessId: string };

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private support: SupportService) {}

  @Get('tickets')
  list(@CurrentUser() user: AuthUser) {
    return this.support.listForBusiness(user.businessId);
  }

  @Post('tickets')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user, dto);
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getForBusiness(user.businessId, id);
  }

  @Post('tickets/:id/messages')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TicketMessageDto) {
    return this.support.replyAsUser(user, id, dto.body);
  }
}
