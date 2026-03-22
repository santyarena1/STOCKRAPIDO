import { Module } from '@nestjs/common';
import { AiInvoiceController } from './ai-invoice.controller';
import { AiInvoiceService } from './ai-invoice.service';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';

@Module({
  controllers: [PurchasesController, AiInvoiceController],
  providers: [PurchasesService, AiInvoiceService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
