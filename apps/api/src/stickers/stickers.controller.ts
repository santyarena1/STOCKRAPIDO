import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StickersService } from './stickers.service';

type AuthUser = { businessId: string };

// ===== Internal management (JWT protected) =====

@Controller('stickers')
@UseGuards(JwtAuthGuard)
export class StickersController {
  constructor(private stickers: StickersService) {}

  @Post('seed-countries')
  seedCountries(@CurrentUser() u: AuthUser) {
    return this.stickers.seedCountries(u.businessId);
  }

  @Get('countries')
  listCountries(
    @CurrentUser() u: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.stickers.listCountries(u.businessId, includeInactive === 'true');
  }

  @Post('countries')
  createCountry(
    @CurrentUser() u: AuthUser,
    @Body() body: { name: string; code?: string; flag?: string; flagUrl?: string; price?: number },
  ) {
    return this.stickers.createCountry(u.businessId, body);
  }

  @Patch('countries/:countryId')
  updateCountry(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      flag?: string;
      flagUrl?: string;
      price?: number;
      isActive?: boolean;
    },
  ) {
    return this.stickers.updateCountry(u.businessId, countryId, body);
  }

  @Patch('countries/:countryId/price')
  updateCountryPrice(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
    @Body() body: { price: number },
  ) {
    return this.stickers.updateCountryPrice(u.businessId, countryId, body.price);
  }

  @Post('prices/global')
  setGlobalPrice(@CurrentUser() u: AuthUser, @Body() body: { price: number }) {
    return this.stickers.setGlobalPrice(u.businessId, body.price);
  }

  @Post('stickers/bulk-prices')
  bulkUpdateStickerPrices(
    @CurrentUser() u: AuthUser,
    @Body() body: { prices: { stickerId: string; price: number | null }[] },
  ) {
    return this.stickers.bulkUpdateStickerPrices(u.businessId, body.prices ?? []);
  }

  @Post('countries/bulk-prices')
  bulkUpdatePrices(
    @CurrentUser() u: AuthUser,
    @Body() body: { prices: { countryId: string; price: number }[] },
  ) {
    return this.stickers.bulkUpdatePrices(u.businessId, body.prices ?? []);
  }

  @Post('countries/:countryId/stickers')
  ensureStickers(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
    @Body() body: { maxNumber: number },
  ) {
    return this.stickers.ensureStickersForCountry(u.businessId, countryId, body.maxNumber);
  }

  @Post('countries/:countryId/stickers/bulk')
  bulkUpdateStickers(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
    @Body() body: { entries: { number: number; stock?: number; delta?: number }[] },
  ) {
    return this.stickers.bulkUpdateStickers(u.businessId, countryId, body.entries ?? []);
  }

  @Patch('countries/:countryId/stickers/:number')
  upsertSticker(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
    @Param('number', ParseIntPipe) number: number,
    @Body() body: { stock: number },
  ) {
    return this.stickers.upsertSticker(u.businessId, countryId, number, body.stock);
  }

  @Get('countries/:countryId/stickers')
  listStickers(
    @CurrentUser() u: AuthUser,
    @Param('countryId') countryId: string,
  ) {
    return this.stickers.listStickersForCountry(u.businessId, countryId);
  }

  @Get('share')
  getOrCreateShare(@CurrentUser() u: AuthUser) {
    return this.stickers.getOrCreateShare(u.businessId);
  }

  @Patch('share')
  updateShare(@CurrentUser() u: AuthUser, @Body() body: { isActive: boolean }) {
    return this.stickers.updateShare(u.businessId, body.isActive);
  }

  @Get('orders')
  listOrders(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.stickers.listOrders(u.businessId, status);
  }

  @Patch('orders/:orderId/status')
  updateOrderStatus(
    @CurrentUser() u: AuthUser,
    @Param('orderId') orderId: string,
    @Body() body: { status: string },
  ) {
    return this.stickers.updateOrderStatus(u.businessId, orderId, body.status);
  }

  @Delete('orders/:orderId')
  deleteOrder(@CurrentUser() u: AuthUser, @Param('orderId') orderId: string) {
    return this.stickers.deleteOrder(u.businessId, orderId);
  }
}

// ===== Public catalog (no auth guard) =====

@Controller('public/stickers')
export class StickerPublicController {
  constructor(private stickers: StickersService) {}

  @Get(':token')
  getCatalog(@Param('token') token: string) {
    return this.stickers.getCatalogByToken(token);
  }

  @Post(':token/orders')
  createOrder(
    @Param('token') token: string,
    @Body()
    body: {
      buyerName?: string;
      buyerPhone?: string;
      notes?: string;
      items: { stickerId: string; qty: number }[];
    },
  ) {
    return this.stickers.createOrder(
      token,
      body.buyerName,
      body.buyerPhone,
      body.notes,
      body.items ?? [],
    );
  }
}
