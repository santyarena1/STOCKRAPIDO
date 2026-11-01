import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { PantallasPublicController } from './pantallas-public.controller';
import { BusinessService } from './business.service';

@Module({
  controllers: [BusinessController, PantallasPublicController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
