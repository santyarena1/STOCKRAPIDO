import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { FiscalReceivedService } from './fiscal-received.service';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, FiscalReceivedService],
  exports: [FiscalService, FiscalReceivedService],
})
export class FiscalModule {}