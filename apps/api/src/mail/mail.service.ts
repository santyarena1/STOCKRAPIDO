import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  async sendPasswordReset(to: string, resetLink: string) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MAIL] Password reset:', to, '->', resetLink);
      return;
    }
    // TODO: SMTP (Hostinger / SendGrid). Usar template.
  }
}
