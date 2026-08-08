import { Body, Controller, ForbiddenException, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DataAdminService } from './data-admin.service';

type User = { id: string; businessId: string };

@Controller('data-admin')
export class DataAdminController {
  constructor(private dataAdmin: DataAdminService) {}

  @Post('wipe')
  @UseGuards(JwtAuthGuard)
  wipe(@CurrentUser() user: User, @Body() body: { category: string; confirm: string }) {
    return this.dataAdmin.wipe(user.businessId, user.id, body?.category, body?.confirm);
  }

  @Get('backups')
  @UseGuards(JwtAuthGuard)
  backups(@CurrentUser() user: User) {
    return this.dataAdmin.backups(user.businessId);
  }

  @Get('purge-cron')
  purgeCron(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || authorization !== `Bearer ${secret}`) throw new ForbiddenException('cron secret inválido');
    return this.dataAdmin.purgeExpired();
  }
}
