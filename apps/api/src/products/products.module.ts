import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SerperService } from './serper.service';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [BusinessModule],
  controllers: [ProductsController],
  providers: [ProductsService, SerperService],
  exports: [ProductsService],
})
export class ProductsModule {}
