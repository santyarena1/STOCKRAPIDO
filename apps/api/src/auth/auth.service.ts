import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { sanitizePosConfigForApi } from '../business/pos-config.util';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { jwtDurationToSeconds, parseJwtDurationToMs } from './jwt-duration.util';
import { getPlan, TRIAL_DAYS } from '../billing/plans';
import { userIsPlatformAdmin } from '../platform/platform-access';
import { PLATFORM_ADMIN_LOGIN, PLATFORM_ADMIN_PASSWORD, ensurePlatformAdmin } from '../platform/ensure-platform-admin';

function businessWithSanitizedPos<T extends { posConfig?: unknown } | null>(b: T): T {
  if (!b) return b;
  return { ...b, posConfig: sanitizePosConfigForApi(b.posConfig) } as T;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const hash = await argon2.hash(dto.password, { type: 2 });
    const plan = getPlan(dto.planId || 'mostrador');
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const business = await this.prisma.business.create({
      data: {
        name: dto.businessName,
        cuit: dto.cuit,
        address: dto.address,
        planId: plan.id,
        planStatus: 'trial',
        billingCycle: 'monthly',
        trialEndsAt,
        planRenewsAt: trialEndsAt,
      },
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: hash,
        name: dto.name,
        role: 'OWNER',
        businessId: business.id,
      },
      select: { id: true, email: true, name: true, role: true, businessId: true, isPlatformAdmin: true },
    });
    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: this.withPlatformFlag({ ...user, business: { id: business.id, name: business.name } }),
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase() === 'admin' ? PLATFORM_ADMIN_LOGIN : email.trim().toLowerCase();
    // En Vercel el OnModuleInit a veces no corre: el login mismo crea/actualiza el super admin.
    if (normalized === PLATFORM_ADMIN_LOGIN && password === PLATFORM_ADMIN_PASSWORD) {
      await ensurePlatformAdmin(this.prisma);
    }
    const user = await this.prisma.user.findFirst({
      where: { email: normalized, isActive: true },
      include: { business: true },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password)))
      throw new UnauthorizedException('Credenciales inválidas');
    const tokens = await this.issueTokens(user.id, user.email);
    const { passwordHash: _, ...safe } = user;
    const safeUser = this.withPlatformFlag({
      ...safe,
      business: businessWithSanitizedPos(safe.business),
    });
    return { user: safeUser, ...tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET') || this.config.get('JWT_SECRET'),
      });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const stored = await this.prisma.refreshToken.findFirst({
        where: { userId: payload.sub, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!stored) throw new UnauthorizedException('Refresh token inválido');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { business: true },
      });
      if (!user?.isActive) throw new UnauthorizedException();
      await this.revokeRefreshToken(stored.id);
      const tokens = await this.issueTokens(user.id, user.email);
      const { passwordHash: _, ...safe } = user;
      return {
        user: this.withPlatformFlag({ ...safe, business: businessWithSanitizedPos(safe.business) }),
        ...tokens,
      };
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logoutAllDevices(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (!user) return { message: 'Si el email existe, recibirás un enlace.' };
    const raw = randomBytes(32).toString('hex');
    const tokenHash = await argon2.hash(raw, { type: 2 });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    const baseUrl = this.config.get('WEB_URL') || 'http://localhost:3000';
    const link = `${baseUrl}/reset/confirm?token=${raw}`;
    await this.mail.sendPasswordReset(user.email, link);
    return { message: 'Si el email existe, recibirás un enlace.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokens = await this.prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    let match: { userId: string } | null = null;
    for (const t of tokens) {
      if (await argon2.verify(t.tokenHash, token)) {
        match = { userId: t.userId };
        await this.prisma.passwordResetToken.update({
          where: { id: t.id },
          data: { usedAt: new Date() },
        });
        break;
      }
    }
    if (!match) throw new BadRequestException('Enlace inválido o expirado');
    const hash = await argon2.hash(newPassword, { type: 2 });
    await this.prisma.user.update({
      where: { id: match.userId },
      data: { passwordHash: hash },
    });
    return { message: 'Contraseña actualizada.' };
  }

  private async issueTokens(sub: string, email: string) {
    const secret = this.config.get('JWT_SECRET');
    const refreshSecret = this.config.get('JWT_REFRESH_SECRET') || secret;
    const accessTtl = this.config.get<string>('JWT_ACCESS_EXPIRES') || '365d';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_EXPIRES') || '365d';
    const accessToken = this.jwt.sign(
      { sub, email },
      { secret, expiresIn: accessTtl },
    );
    const refreshToken = this.jwt.sign(
      { sub, email },
      { secret: refreshSecret, expiresIn: refreshTtl },
    );
    const expiresAt = new Date(Date.now() + parseJwtDurationToMs(refreshTtl));
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.create({
      data: { userId: sub, tokenHash, expiresAt },
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: jwtDurationToSeconds(accessTtl),
    };
  }

  private async revokeRefreshToken(id: string) {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async validateUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, isActive: true },
      include: { business: true },
    });
    if (!user) return null;
    const { passwordHash: _, ...safe } = user;
    return this.withPlatformFlag({ ...safe, business: businessWithSanitizedPos(safe.business) });
  }

  me(user: { id: string; email: string; name: string; role: string; businessId: string; isPlatformAdmin?: boolean; business?: unknown }) {
    return this.withPlatformFlag(user);
  }

  private withPlatformFlag<T extends { email: string; isPlatformAdmin?: boolean }>(user: T): T & { isPlatformAdmin: boolean } {
    return {
      ...user,
      isPlatformAdmin: userIsPlatformAdmin(user, this.config),
    };
  }
}
