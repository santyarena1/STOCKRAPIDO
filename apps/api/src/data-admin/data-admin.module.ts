import { Module } from '@nestjs/common';
import { DataAdminController } from './data-admin.controller';
import { DataAdminService } from './data-admin.service';

@Module({ controllers: [DataAdminController], providers: [DataAdminService] })
export class DataAdminModule {}
