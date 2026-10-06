import { Module, forwardRef } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SerperService } from './serper.service';
import { BusinessModule } from '../business/business.module';
import { PublicCatalogModule } from '../public-catalog/public-catalog.module';
import { ConsignmentModule } from '../consignment/consignment.module';

@Module({
  imports: [BusinessModule, forwardRef(() => PublicCatalogModule), ConsignmentModule],
  controllers: [ProductsController],
  providers: [ProductsService, SerperService],
  exports: [ProductsService],
})
export class ProductsModule {}
