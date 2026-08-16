import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [SupportModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
