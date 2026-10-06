import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ProductsModule } from '../products/products.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { ConsignmentModule } from '../consignment/consignment.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [ProductsModule, FiscalModule, ConsignmentModule, LoyaltyModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
