import { Module } from '@nestjs/common';
import { PreciosClarosController } from './precios-claros.controller';
import { PreciosClarosService } from './precios-claros.service';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [BusinessModule],
  controllers: [PreciosClarosController],
  providers: [PreciosClarosService],
  exports: [PreciosClarosService],
})
export class PreciosClarosModule {}
