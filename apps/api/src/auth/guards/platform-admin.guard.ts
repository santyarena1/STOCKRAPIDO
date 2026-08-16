import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { userIsPlatformAdmin } from '../../platform/platform-access';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { email?: string; isPlatformAdmin?: boolean } }>();
    const user = req.user;
    if (!user?.email || !userIsPlatformAdmin({ email: user.email, isPlatformAdmin: user.isPlatformAdmin }, this.config)) {
      throw new ForbiddenException('Este panel es solo para el equipo de StockRápido.');
    }
    return true;
  }
}
