import { ConfigService } from '@nestjs/config';

export type PlatformUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  businessId: string;
  isPlatformAdmin?: boolean;
};

export function platformAdminEmails(config: ConfigService): string[] {
  return (config.get<string>('SUPER_ADMIN_EMAILS') || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function userIsPlatformAdmin(user: { email: string; isPlatformAdmin?: boolean }, config: ConfigService): boolean {
  if (user.isPlatformAdmin) return true;
  return platformAdminEmails(config).includes(user.email.toLowerCase());
}
