import { Module } from '@nestjs/common';
import { ConsignmentController } from './consignment.controller';
import { ConsignmentService } from './consignment.service';

@Module({
  controllers: [ConsignmentController],
  providers: [ConsignmentService],
  exports: [ConsignmentService],
})
export class ConsignmentModule {}
