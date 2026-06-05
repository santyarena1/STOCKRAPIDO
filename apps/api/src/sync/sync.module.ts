import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { MondelezProvider } from './mondelez.provider';

@Module({
  imports: [PrismaModule],
  controllers: [SyncController],
  providers: [SyncService, MondelezProvider],
})
export class SyncModule {}
