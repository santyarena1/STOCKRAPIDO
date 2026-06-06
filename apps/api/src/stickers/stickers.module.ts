import { Module } from '@nestjs/common';
import { StickersController, StickerPublicController } from './stickers.controller';
import { StickersService } from './stickers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StickersController, StickerPublicController],
  providers: [StickersService],
})
export class StickersModule {}
