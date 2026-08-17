import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ensurePlatformAdmin } from './ensure-platform-admin';

@Injectable()
export class PlatformAdminBootstrap implements OnModuleInit {
  private readonly log = new Logger(PlatformAdminBootstrap.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await ensurePlatformAdmin(this.prisma);
    } catch (err) {
      this.log.error('No se pudo asegurar el super admin', err as Error);
    }
  }
}
