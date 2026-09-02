import { equal } from 'node:assert/strict';
import {
  discountFromGrants,
  monthsToConsume,
  normalizeReferralCode,
  payableAmount,
} from './referral.util';

equal(normalizeReferralCode(' k7m-3pq '), 'K7M3PQ');
equal(normalizeReferralCode('ab'), null);
equal(monthsToConsume('monthly', 3), 1);
equal(monthsToConsume('yearly', 3), 3);
equal(monthsToConsume('yearly', 1), 1);
equal(monthsToConsume('monthly', 0), 0);

const stacked = discountFromGrants(
  [
    { id: 'a', monthsLeft: 3, discountPerMonth: 5000 },
    { id: 'b', monthsLeft: 2, discountPerMonth: 5000 },
  ],
  'monthly',
);
equal(stacked.discount, 10000);
equal(stacked.consumptions.length, 2);

const yearly = discountFromGrants([{ id: 'a', monthsLeft: 3, discountPerMonth: 5000 }], 'yearly');
equal(yearly.discount, 15000);

equal(payableAmount(19900, 5000), 14900);
equal(payableAmount(19900, 25000), 0);

console.log('referral.util ok');
