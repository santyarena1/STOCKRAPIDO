import { Module, forwardRef } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SerperService } from './serper.service';
import { BusinessModule } from '../business/business.module';
import { PublicCatalogModule } from '../public-catalog/public-catalog.module';

@Module({
  imports: [BusinessModule, forwardRef(() => PublicCatalogModule)],
  controllers: [ProductsController],
  providers: [ProductsService, SerperService],
  exports: [ProductsService],
})
export class ProductsModule {}
