import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { PausedSalesModule } from './paused-sales/paused-sales.module';
import { CajaModule } from './caja/caja.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { CustomersModule } from './customers/customers.module';
import { ReportsModule } from './reports/reports.module';
import { PromosModule } from './promos/promos.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    BusinessModule,
    ProductsModule,
    SalesModule,
    PausedSalesModule,
    CajaModule,
    SuppliersModule,
    PurchasesModule,
    CustomersModule,
    ReportsModule,
    PromosModule,
    UsersModule,
  ],
})
export class AppModule {}
