import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { MondelezProvider } from './mondelez.provider';
import { TokinProvider } from './tokin.provider';

@Module({
  imports: [PrismaModule],
  controllers: [SyncController],
  providers: [SyncService, MondelezProvider, TokinProvider],
})
export class SyncModule {}
