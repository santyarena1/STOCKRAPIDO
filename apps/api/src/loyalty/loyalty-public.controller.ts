import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyWalletService } from './loyalty-wallet.service';
import { readCookie } from './loyalty-crypto';

function tokenFrom(req: Request) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return readCookie(req.headers.cookie, 'sr_loyalty');
}

function setSession(res: Response, token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `sr_loyalty=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`,
  );
}

@Controller('public/loyalty')
export class LoyaltyPublicController {
  constructor(
    private loyalty: LoyaltyService,
    private wallet: LoyaltyWalletService,
  ) {}

  @Get('program/:slug')
  program(@Param('slug') slug: string) {
    return this.loyalty.publicProgram(slug);
  }

  @Post('program/:slug/register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async register(
    @Param('slug') slug: string,
    @Body() body: { name: string; phone?: string; email?: string; pin: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.loyalty.register(slug, body);
    setSession(res, session.token, session.expiresAt);
    return session;
  }

  @Post('program/:slug/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async login(
    @Param('slug') slug: string,
    @Body() body: { phone?: string; email?: string; pin: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.loyalty.login(slug, body);
    setSession(res, session.token, session.expiresAt);
    return session;
  }

  @Post('session/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.loyalty.logout(tokenFrom(req));
    res.setHeader('Set-Cookie', 'sr_loyalty=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  }

  @Get('session')
  session(@Req() req: Request) {
    return this.loyalty.portalHome(tokenFrom(req));
  }

  @Post('checkin')
  checkin(@Req() req: Request) {
    return this.loyalty.checkIn(tokenFrom(req));
  }

  @Get('checkin/current')
  current(@Req() req: Request) {
    return this.loyalty.currentCheckin(tokenFrom(req));
  }

  @Get('claim/:token')
  claimPreview(@Req() req: Request, @Param('token') token: string) {
    return this.loyalty.claimPreview(tokenFrom(req), token);
  }

  @Post('claim/:token')
  claim(@Req() req: Request, @Param('token') token: string) {
    return this.loyalty.claim(tokenFrom(req), token);
  }

  @Post('topups')
  topup(
    @Req() req: Request,
    @Body() body: { amountArs?: number; points?: number; payerName: string; note?: string; reference?: string },
  ) {
    return this.loyalty.createTopup(tokenFrom(req), body);
  }

  @Post('rewards/:rewardId/redeem')
  redeem(@Req() req: Request, @Param('rewardId') rewardId: string) {
    return this.loyalty.redeemReward(tokenFrom(req), rewardId);
  }

  @Post('pin/forgot')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgot(@Body() body: { slug: string; email: string }) {
    return this.loyalty.requestPinEmail(body.slug, body.email);
  }

  @Post('pin/reset')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  reset(@Body() body: { token: string; pin: string }) {
    return this.loyalty.confirmPinEmail(body.token, body.pin);
  }

  @Get('wallet/status')
  walletStatus(@Req() req: Request) {
    return this.loyalty.sessionAccount(tokenFrom(req)).then(() => this.wallet.status());
  }

  @Get('wallet/google')
  async google(@Req() req: Request) {
    const account = await this.loyalty.sessionAccount(tokenFrom(req));
    const url = await this.wallet.googleSaveUrl(account.id);
    return { url };
  }

  @Get('wallet/apple')
  async apple(@Req() req: Request, @Res() res: Response) {
    const account = await this.loyalty.sessionAccount(tokenFrom(req));
    const buffer = await this.wallet.applePassBuffer(account.id);
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', 'attachment; filename="fidelidad.pkpass"');
    res.send(buffer);
  }
}
