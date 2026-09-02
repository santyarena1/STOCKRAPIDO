import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ReferralService } from './referral.service';
import { PlatformSellersService } from './sellers.service';

@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, ReferralService, PlatformSellersService],
  exports: [BillingService, ReferralService, PlatformSellersService],
})
export class BillingModule {}
