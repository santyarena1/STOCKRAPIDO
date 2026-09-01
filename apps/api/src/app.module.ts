import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ReadOnlyGuard, RolesGuard } from './auth/guards/tenant.guards';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
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
import { SyncModule } from './sync/sync.module';
import { StickersModule } from './stickers/stickers.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { VendedoresModule } from './vendedores/vendedores.module';
import { DataAdminModule } from './data-admin/data-admin.module';
import { SupportModule } from './support/support.module';
import { PlatformModule } from './platform/platform.module';
import { PreciosClarosModule } from './precios-claros/precios-claros.module';
import { ConsignmentModule } from './consignment/consignment.module';
import { PublicCatalogModule } from './public-catalog/public-catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    BillingModule,
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
    SyncModule,
    StickersModule,
    FiscalModule,
    VendedoresModule,
    DataAdminModule,
    SupportModule,
    PlatformModule,
    PreciosClarosModule,
    ConsignmentModule,
    PublicCatalogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ReadOnlyGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
