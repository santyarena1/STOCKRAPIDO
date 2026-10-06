import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { publicApiUrl } from './loyalty-crypto';
import { formatArsFromCents, formatPoints, pointsToCents } from '../../../../shared/loyalty-money';

const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAb0lEQVR42u3XsRHAIAxDUW2QMgOky+BsmBoWCAGOkxE5Fa7/q7DBcd555cCALQFPul6HCqhFZzFgxEcQYMV7EWDGexBgx1sIRMS/EAYgKl5DGGCAHsDvgARg+TKSWMcSB4nESSZxlEqc5f4Z/RZQAJjAvOo9UrYTAAAAAElFTkSuQmCC',
  'base64',
);

type ServiceAccount = { client_email: string; private_key: string };

export type WalletStatus = {
  apple: { ready: boolean; missing: string[] };
  google: { ready: boolean; missing: string[] };
};

@Injectable()
export class LoyaltyWalletService {
  private readonly logger = new Logger(LoyaltyWalletService.name);

  constructor(private prisma: PrismaService) {}

  status(): WalletStatus {
    return { apple: this.appleStatus(), google: this.googleStatus() };
  }

  appleStatus(): WalletStatus['apple'] {
    const missing: string[] = [];
    if (process.env.APPLE_WALLET_ENABLED !== 'true') missing.push('APPLE_WALLET_ENABLED');
    if (!process.env.APPLE_PASS_TYPE_IDENTIFIER) missing.push('APPLE_PASS_TYPE_IDENTIFIER');
    if (!process.env.APPLE_TEAM_IDENTIFIER) missing.push('APPLE_TEAM_IDENTIFIER');
    if (!this.envPem('APPLE_WALLET_CERT', 'APPLE_WALLET_CERT_BASE64')) missing.push('APPLE_WALLET_CERT');
    if (!this.envPem('APPLE_WALLET_KEY', 'APPLE_WALLET_KEY_BASE64')) missing.push('APPLE_WALLET_KEY');
    if (!this.envPem('APPLE_WALLET_WWDR_CERT', 'APPLE_WALLET_WWDR_BASE64', 'APPLE_WALLET_WWDR')) {
      missing.push('APPLE_WALLET_WWDR_CERT');
    }
    return { ready: missing.length === 0, missing };
  }

  googleStatus(): WalletStatus['google'] {
    const missing: string[] = [];
    if (process.env.GOOGLE_WALLET_ENABLED !== 'true') missing.push('GOOGLE_WALLET_ENABLED');
    if (!process.env.GOOGLE_WALLET_ISSUER_ID) missing.push('GOOGLE_WALLET_ISSUER_ID');
    if (!this.serviceAccount()) missing.push('GOOGLE_WALLET_SERVICE_ACCOUNT_BASE64');
    return { ready: missing.length === 0, missing };
  }

  async syncBalance(accountId: string): Promise<void> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { id: accountId },
      include: { business: { select: { name: true, loyaltyConfig: true } } },
    });
    if (!account?.business.loyaltyConfig) return;
    const errors: string[] = [];
    if (this.appleStatus().ready && account.appleSerial) {
      try {
        await this.pushApple(account.appleSerial);
      } catch (error) {
        errors.push(`Apple: ${error instanceof Error ? error.message : 'error'}`);
      }
    }
    if (this.googleStatus().ready) {
      try {
        await this.upsertGoogleObject(account.id);
      } catch (error) {
        errors.push(`Google: ${error instanceof Error ? error.message : 'error'}`);
      }
    }
    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        walletSyncedAt: errors.length ? account.walletSyncedAt : new Date(),
        walletSyncError: errors.length ? errors.join(' · ').slice(0, 500) : null,
      },
    });
    if (errors.length) this.logger.warn(`Wallet ${account.id}: ${errors.join(' | ')}`);
  }

  async applePassBuffer(accountId: string): Promise<Buffer> {
    const ready = this.appleStatus();
    if (!ready.ready) {
      throw new Error(`Apple Wallet no está configurado (${ready.missing.join(', ')}).`);
    }
    const account = await this.loadAccount(accountId);
    const authToken = await this.ensureAppleIdentity(account.id);
    const serial = (await this.prisma.loyaltyAccount.findUnique({ where: { id: account.id } }))?.appleSerial;
    if (!serial || !authToken) throw new Error('No se pudo preparar la tarjeta.');
    const config = account.business.loyaltyConfig!;
    const points = account.balancePoints;
    const cents = pointsToCents(points, config.pointsPerArs);
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
      organizationName: account.business.name,
      description: config.programName || 'Fidelización',
      logoText: 'STOCKRAPIDO',
      backgroundColor: 'rgb(15, 23, 42)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(251, 191, 36)',
      storeCard: {
        primaryFields: [{ key: 'points', label: 'PUNTOS', value: formatPoints(points) }],
        secondaryFields: [{ key: 'ars', label: 'EQUIVALE A', value: formatArsFromCents(cents) }],
        auxiliaryFields: [{ key: 'holder', label: 'CLIENTE', value: account.name }],
        backFields: [
          { key: 'program', label: 'Programa', value: config.programName || 'Fidelización' },
          { key: 'business', label: 'Comercio', value: account.business.name },
        ],
      },
    };
    const { PKPass } = (await import('passkit-generator')) as {
      PKPass: new (
        buffers: Record<string, Buffer>,
        certificates: { wwdr: Buffer; signerCert: Buffer; signerKey: Buffer; signerKeyPassphrase?: string },
        props: { serialNumber: string; authenticationToken: string; webServiceURL: string; description: string },
      ) => { setBarcodes: (barcode: unknown) => void; getAsBuffer: () => Buffer };
    };
    const pass = new PKPass(
      {
        'pass.json': Buffer.from(JSON.stringify(passJson)),
        'icon.png': ICON_PNG,
        'logo.png': ICON_PNG,
        'icon@2x.png': ICON_PNG,
      },
      {
        wwdr: this.envPem('APPLE_WALLET_WWDR_CERT', 'APPLE_WALLET_WWDR_BASE64', 'APPLE_WALLET_WWDR')!,
        signerCert: this.envPem('APPLE_WALLET_CERT', 'APPLE_WALLET_CERT_BASE64')!,
        signerKey: this.envPem('APPLE_WALLET_KEY', 'APPLE_WALLET_KEY_BASE64')!,
        signerKeyPassphrase: process.env.APPLE_WALLET_CERT_PASSWORD || undefined,
      },
      {
        serialNumber: serial,
        authenticationToken: authToken,
        webServiceURL: `${publicApiUrl()}/loyalty/apple`,
        description: config.programName || 'Fidelización',
      },
    );
    pass.setBarcodes({
      message: account.publicToken,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: account.name,
    });
    return pass.getAsBuffer();
  }

  async googleSaveUrl(accountId: string): Promise<string> {
    const ready = this.googleStatus();
    if (!ready.ready) throw new Error(`Google Wallet no está configurado (${ready.missing.join(', ')}).`);
    const account = await this.loadAccount(accountId);
    const sa = this.serviceAccount()!;
    const objectId = await this.ensureGoogleObjectId(account.id);
    const jwt = this.signGoogleJwt(sa, {
      iss: sa.client_email,
      aud: 'google',
      typ: 'savetowallet',
      origins: [],
      payload: {
        loyaltyClasses: [this.googleClass(account.business.name, account.business.loyaltyConfig?.programName || 'Fidelización')],
        loyaltyObjects: [this.googleObject(account, objectId)],
      },
    });
    return `https://pay.google.com/gp/v/save/${jwt}`;
  }

  async registerDevice(input: {
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
    pushToken: string;
    authToken: string;
  }) {
    const account = await this.accountByAppleAuth(input.serialNumber, input.authToken);
    if (!account) return false;
    await this.prisma.loyaltyWalletDevice.upsert({
      where: {
        deviceLibraryIdentifier_serialNumber: {
          deviceLibraryIdentifier: input.deviceLibraryIdentifier,
          serialNumber: input.serialNumber,
        },
      },
      create: {
        businessId: account.businessId,
        loyaltyAccountId: account.id,
        deviceLibraryIdentifier: input.deviceLibraryIdentifier,
        passTypeIdentifier: input.passTypeIdentifier,
        serialNumber: input.serialNumber,
        pushToken: input.pushToken,
      },
      update: { pushToken: input.pushToken, passTypeIdentifier: input.passTypeIdentifier },
    });
    return true;
  }

  async unregisterDevice(deviceLibraryIdentifier: string, serialNumber: string, authToken: string) {
    const account = await this.accountByAppleAuth(serialNumber, authToken);
    if (!account) return false;
    await this.prisma.loyaltyWalletDevice.deleteMany({
      where: { deviceLibraryIdentifier, serialNumber, loyaltyAccountId: account.id },
    });
    return true;
  }

  async serialsForDevice(deviceLibraryIdentifier: string, passTypeIdentifier: string, updatedSince?: string) {
    const since = updatedSince ? new Date(Number(updatedSince) * 1000) : null;
    const devices = await this.prisma.loyaltyWalletDevice.findMany({
      where: { deviceLibraryIdentifier, passTypeIdentifier },
      include: { account: { select: { updatedAt: true, appleSerial: true } } },
    });
    const serialNumbers = devices
      .filter((device) => !since || device.account.updatedAt > since)
      .map((device) => device.serialNumber);
    const latest = devices.reduce((max, device) => Math.max(max, device.account.updatedAt.getTime()), Date.now());
    return { serialNumbers, lastUpdated: String(Math.floor(latest / 1000)) };
  }

  async passForSerial(serialNumber: string, authToken: string): Promise<Buffer | null> {
    const account = await this.accountByAppleAuth(serialNumber, authToken);
    if (!account) return null;
    return this.applePassBuffer(account.id);
  }

  private async loadAccount(accountId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { id: accountId },
      include: { business: { include: { loyaltyConfig: true } } },
    });
    if (!account?.business.loyaltyConfig) throw new Error('La cuenta no tiene un programa activo.');
    return account;
  }

  private async ensureAppleIdentity(accountId: string): Promise<string> {
    const { openSecret, sealSecret, randomToken } = await import('./loyalty-crypto');
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Cuenta no encontrada.');
    let serial = account.appleSerial;
    let token = account.appleAuthTokenEnc ? openSecret(account.appleAuthTokenEnc) : '';
    if (!serial || !token) {
      serial = serial || `sr${randomToken(12)}`;
      token = token || randomToken(24);
      await this.prisma.loyaltyAccount.update({
        where: { id: accountId },
        data: { appleSerial: serial, appleAuthTokenEnc: sealSecret(token) },
      });
    }
    return token;
  }

  private async accountByAppleAuth(serialNumber: string, authToken: string) {
    const { openSecret } = await import('./loyalty-crypto');
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { appleSerial: serialNumber } });
    if (!account?.appleAuthTokenEnc) return null;
    try {
      if (openSecret(account.appleAuthTokenEnc) !== authToken) return null;
    } catch {
      return null;
    }
    return account;
  }

  private async pushApple(serialNumber: string) {
    const key = this.envPem('APPLE_WALLET_APNS_KEY', 'APPLE_WALLET_APNS_KEY_BASE64');
    const keyId = process.env.APPLE_WALLET_APNS_KEY_ID;
    if (!key || !keyId) return;
    const devices = await this.prisma.loyaltyWalletDevice.findMany({ where: { serialNumber } });
    if (!devices.length) return;
    const teamId = process.env.APPLE_WALLET_APNS_TEAM_ID || process.env.APPLE_TEAM_IDENTIFIER || '';
    const token = this.signEs256(key, keyId, teamId);
    const host = process.env.APPLE_WALLET_APNS_HOST || 'https://api.push.apple.com';
    await Promise.all(
      devices.map(async (device) => {
        const res = await fetch(`${host}/3/device/${device.pushToken}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${token}`,
            'apns-topic': device.passTypeIdentifier,
            'apns-push-type': 'background',
          },
          body: '{}',
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text.slice(0, 180) || `APNs ${res.status}`);
        }
      }),
    );
  }

  private signEs256(keyPem: Buffer, keyId: string, teamId: string) {
    const header = this.b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
    const now = Math.floor(Date.now() / 1000);
    const body = this.b64url(JSON.stringify({ iss: teamId, iat: now }));
    const signer = createSign('SHA256');
    signer.update(`${header}.${body}`);
    signer.end();
    const sig = signer.sign({ key: keyPem, dsaEncoding: 'ieee-p1363' });
    return `${header}.${body}.${this.b64url(sig)}`;
  }

  private async ensureGoogleObjectId(accountId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Cuenta no encontrada.');
    if (account.googleObjectId) return account.googleObjectId;
    const issuer = process.env.GOOGLE_WALLET_ISSUER_ID;
    const objectId = `${issuer}.${account.publicToken}`;
    await this.prisma.loyaltyAccount.update({ where: { id: accountId }, data: { googleObjectId: objectId } });
    return objectId;
  }

  private async upsertGoogleObject(accountId: string) {
    const account = await this.loadAccount(accountId);
    const sa = this.serviceAccount();
    if (!sa) return;
    const access = await this.googleAccessToken(sa);
    const objectId = await this.ensureGoogleObjectId(account.id);
    const object = this.googleObject(account, objectId);
    const classBody = this.googleClass(account.business.name, account.business.loyaltyConfig?.programName || 'Fidelización');
    await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(classBody),
    });
    const existing = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    const res = await fetch(
      existing.ok
        ? `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`
        : 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject',
      {
        method: existing.ok ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(object),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text.slice(0, 240) || `Google Wallet ${res.status}`);
    }
  }

  private googleClass(issuerName: string, programName: string) {
    const issuer = process.env.GOOGLE_WALLET_ISSUER_ID;
    const classId = process.env.GOOGLE_WALLET_CLASS_ID || `${issuer}.stockrapido_loyalty`;
    return {
      id: classId,
      issuerName,
      programName,
      reviewStatus: 'UNDER_REVIEW',
      programLogo: {
        sourceUri: { uri: 'https://stockrapido.com/brand/icon.svg' },
        contentDescription: { defaultValue: { language: 'es', value: 'StockRápido' } },
      },
    };
  }

  private googleObject(
    account: {
      name: string;
      publicToken: string;
      balancePoints: number;
      business: { name: string; loyaltyConfig: { pointsPerArs: number; programName: string } | null };
    },
    objectId: string,
  ) {
    const issuer = process.env.GOOGLE_WALLET_ISSUER_ID;
    const classId = process.env.GOOGLE_WALLET_CLASS_ID || `${issuer}.stockrapido_loyalty`;
    const rate = account.business.loyaltyConfig?.pointsPerArs || 10;
    const cents = pointsToCents(account.balancePoints, rate);
    return {
      id: objectId,
      classId,
      state: 'ACTIVE',
      accountId: account.publicToken,
      accountName: account.name,
      loyaltyPoints: {
        label: 'Puntos',
        balance: { string: formatPoints(account.balancePoints) },
      },
      secondaryLoyaltyPoints: {
        label: 'Equivale a',
        balance: { string: formatArsFromCents(cents) },
      },
      barcode: {
        type: 'QR_CODE',
        value: account.publicToken,
        alternateText: account.name,
      },
    };
  }

  private async googleAccessToken(sa: ServiceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const jwt = this.signGoogleJwt(sa, {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const json = (await res.json()) as { access_token?: string; error?: string };
    if (!json.access_token) throw new Error(json.error || 'No se pudo autenticar con Google Wallet.');
    return json.access_token;
  }

  private signGoogleJwt(sa: ServiceAccount, payload: Record<string, unknown>) {
    const header = this.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = this.b64url(JSON.stringify(payload));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${body}`);
    signer.end();
    const sig = signer.sign(sa.private_key);
    return `${header}.${body}.${this.b64url(sig)}`;
  }

  private serviceAccount(): ServiceAccount | null {
    const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(text) as ServiceAccount;
      if (!parsed.client_email || !parsed.private_key) return null;
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch {
      return null;
    }
  }

  private envPem(...names: string[]): Buffer | null {
    for (const name of names) {
      const value = process.env[name];
      if (!value) continue;
      const text = value.includes('BEGIN') ? value.replace(/\\n/g, '\n') : Buffer.from(value, 'base64').toString('utf8');
      if (text.includes('BEGIN')) return Buffer.from(text);
    }
    return null;
  }

  private b64url(value: string | Buffer) {
    return Buffer.from(value).toString('base64url');
  }
}
