import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController, CustomerPublicController } from './customers.controller';

@Module({
  controllers: [CustomersController, CustomerPublicController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
