import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyWalletService } from './loyalty-wallet.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyPublicController } from './loyalty-public.controller';
import { LoyaltyAppleController } from './loyalty-apple.controller';

@Module({
  controllers: [LoyaltyController, LoyaltyPublicController, LoyaltyAppleController],
  providers: [LoyaltyService, LoyaltyWalletService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
