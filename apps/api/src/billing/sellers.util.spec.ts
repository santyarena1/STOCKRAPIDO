import { equal } from 'node:assert/strict';
import { computeSellerCommission } from './sellers.util';

equal(computeSellerCommission('percent', 10, 19900), 1990);
equal(computeSellerCommission('percent', 10, 14900), 1490);
equal(computeSellerCommission('fixed', 5000, 19900), 5000);
equal(computeSellerCommission('percent', 0, 19900), 0);
equal(computeSellerCommission('fixed', -1, 19900), 0);

console.log('sellers.util ok');
