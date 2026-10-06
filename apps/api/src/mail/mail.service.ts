import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  /** Devuelve true solo si hay un SMTP real o estamos en desarrollo (el enlace queda en el log). */
  async sendLoyaltyPinReset(to: string, resetLink: string): Promise<boolean> {
    const host = (process.env.SMTP_HOST || '').trim();
    const configured = Boolean(host) && host !== 'localhost';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MAIL] Recuperación de PIN de fidelidad:', to, '->', resetLink);
      return true;
    }
    if (!configured) return false;
    console.log('[MAIL] SMTP configurado pero el envío real no está conectado:', to);
    return false;
  }

  async sendPasswordReset(to: string, resetLink: string) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MAIL] Password reset:', to, '->', resetLink);
      return;
    }
    // TODO: SMTP (Hostinger / SendGrid). Usar template.
  }
}
