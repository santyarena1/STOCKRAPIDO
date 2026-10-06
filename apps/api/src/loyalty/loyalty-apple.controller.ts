import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { LoyaltyWalletService } from './loyalty-wallet.service';

function appleToken(header?: string) {
  if (!header) return '';
  return header.replace(/^ApplePass\s+/i, '').trim();
}

@Controller('loyalty/apple')
export class LoyaltyAppleController {
  constructor(private wallet: LoyaltyWalletService) {}

  @Post('v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber')
  async register(
    @Param('deviceLibraryIdentifier') deviceLibraryIdentifier: string,
    @Param('passTypeIdentifier') passTypeIdentifier: string,
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') authorization: string,
    @Body() body: { pushToken?: string },
    @Res() res: Response,
  ) {
    const ok = await this.wallet.registerDevice({
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
      pushToken: body?.pushToken || '',
      authToken: appleToken(authorization),
    });
    res.status(ok ? 201 : 401).send();
  }

  @Delete('v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber')
  async unregister(
    @Param('deviceLibraryIdentifier') deviceLibraryIdentifier: string,
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') authorization: string,
    @Res() res: Response,
  ) {
    const ok = await this.wallet.unregisterDevice(deviceLibraryIdentifier, serialNumber, appleToken(authorization));
    res.status(ok ? 200 : 401).send();
  }

  @Get('v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier')
  async serials(
    @Param('deviceLibraryIdentifier') deviceLibraryIdentifier: string,
    @Param('passTypeIdentifier') passTypeIdentifier: string,
    @Query('passesUpdatedSince') passesUpdatedSince: string,
    @Res() res: Response,
  ) {
    const result = await this.wallet.serialsForDevice(deviceLibraryIdentifier, passTypeIdentifier, passesUpdatedSince);
    if (!result.serialNumbers.length) {
      res.status(204).send();
      return;
    }
    res.json({ serialNumbers: result.serialNumbers, lastUpdated: result.lastUpdated });
  }

  @Get('v1/passes/:passTypeIdentifier/:serialNumber')
  async pass(
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') authorization: string,
    @Res() res: Response,
  ) {
    const buffer = await this.wallet.passForSerial(serialNumber, appleToken(authorization));
    if (!buffer) {
      res.status(401).send();
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.send(buffer);
  }

  @Post('v1/log')
  log() {
    return { ok: true };
  }
}
