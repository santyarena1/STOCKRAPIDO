import { Controller, Get, Param } from '@nestjs/common';
import { BusinessService } from './business.service';

/** Slideshow Teatro — sin login (TV / pestaña fullscreen). */
@Controller('public/pantallas')
export class PantallasPublicController {
  constructor(private business: BusinessService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.business.getPantallasByToken(token);
  }
}
