import { Module } from '@nestjs/common';
import { PausedSalesService } from './paused-sales.service';
import { PausedSalesController } from './paused-sales.controller';

@Module({ controllers: [PausedSalesController], providers: [PausedSalesService], exports: [PausedSalesService] })
export class PausedSalesModule {}
