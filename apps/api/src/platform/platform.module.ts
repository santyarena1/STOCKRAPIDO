import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAdminBootstrap } from './platform-admin.bootstrap';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [SupportModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminBootstrap],
})
export class PlatformModule {}
