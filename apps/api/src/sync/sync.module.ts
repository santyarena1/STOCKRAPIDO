import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { MondelezProvider } from './mondelez.provider';
import { TokinProvider } from './tokin.provider';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [PrismaModule, BusinessModule],
  controllers: [SyncController],
  providers: [SyncService, MondelezProvider, TokinProvider],
})
export class SyncModule {}
