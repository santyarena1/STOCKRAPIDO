import { Module } from '@nestjs/common';
import { PreciosClarosController } from './precios-claros.controller';
import { PreciosClarosService } from './precios-claros.service';

@Module({
  controllers: [PreciosClarosController],
  providers: [PreciosClarosService],
  exports: [PreciosClarosService],
})
export class PreciosClarosModule {}
