import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { assertWritableTenant } from '../../billing/plan-guard';
import { userIsPlatformAdmin } from '../../platform/platform-access';
import { ConfigService } from '@nestjs/config';

export const SKIP_READ_ONLY_KEY = 'skipReadOnly';
export const SkipReadOnly = () => SetMetadata(SKIP_READ_ONLY_KEY, true);

const WRITE_PREFIX_ALLOW = [
  '/auth/logout',
  '/auth/logout-all',
  '/auth/refresh',
  '/billing/',
  '/support/',
  '/business/onboarding',
  '/platform/',
];

@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_READ_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const method = (req.method || 'GET').toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const path: string = req.path || req.url || '';
    if (WRITE_PREFIX_ALLOW.some((p) => path.startsWith(p))) return true;
    if (path === '/health') return true;

    const user = req.user as { businessId?: string; isPlatformAdmin?: boolean; email?: string } | undefined;
    if (!user?.businessId) return true;

    if (user?.email && userIsPlatformAdmin(user as { email: string; isPlatformAdmin?: boolean }, this.config)) return true;

    await assertWritableTenant(this.prisma, user.businessId);
    return true;
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as { role?: string; isPlatformAdmin?: boolean };
    if (user?.isPlatformAdmin) return true;
    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para esta acción.');
    }
    return true;
  }
}
