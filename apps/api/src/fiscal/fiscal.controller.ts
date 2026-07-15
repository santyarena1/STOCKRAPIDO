import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FiscalService } from './fiscal.service';

type User = { businessId: string };
@Controller('fiscal')
@UseGuards(JwtAuthGuard)
export class FiscalController {
  constructor(private fiscal: FiscalService) {}
  @Get('config') config(@CurrentUser() u: User) { return this.fiscal.getPublicConfig(u.businessId); }
  @Put('config') save(@CurrentUser() u: User, @Body() body: any) { return this.fiscal.saveConfig(u.businessId, body); }
  @Post('test') test(@CurrentUser() u: User) { return this.fiscal.testConnection(u.businessId); }
  @Get('sales/:saleId/receipt') receipt(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.receipt(u.businessId, saleId); }
  @Post('sales/:saleId/retry') retry(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
}