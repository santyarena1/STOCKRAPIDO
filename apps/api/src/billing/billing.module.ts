import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ReferralService } from './referral.service';

@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, ReferralService],
  exports: [BillingService, ReferralService],
})
export class BillingModule {}
