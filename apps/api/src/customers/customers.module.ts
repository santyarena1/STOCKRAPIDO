import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController, CustomerPublicController } from './customers.controller';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  controllers: [CustomersController, CustomerPublicController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
