import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mergePosConfigUpdate, sanitizePosConfigForApi } from './pos-config.util';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { decryptSecret, encryptSecret } from '../fiscal/fiscal-crypto';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  private sanitize<T extends Record<string, any>>(business: T) {
    const { openaiKeyEncrypted, serperKeyEncrypted, ...safe } = business;
    return {
      ...safe,
      posConfig: sanitizePosConfigForApi(business.posConfig),
      hasOpenaiKey: !!openaiKeyEncrypted,
      hasSerperKey: !!serperKeyEncrypted,
    };
  }

  async getByUser(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!b) return null;
    return this.sanitize(b);
  }

  async setOpenaiKey(businessId: string, key: string) {
    const normalized = typeof key === 'string' ? key.trim() : '';
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { openaiKeyEncrypted: normalized ? encryptSecret(normalized) : null },
    });
    return this.sanitize(business);
  }

  async getOpenaiKey(businessId: string): Promise<string | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { openaiKeyEncrypted: true },
    });
    if (!business?.openaiKeyEncrypted) return null;
    return decryptSecret(business.openaiKeyEncrypted);
  }

  async setSerperKey(businessId: string, key: string) {
    const normalized = typeof key === 'string' ? key.trim() : '';
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { serperKeyEncrypted: normalized ? encryptSecret(normalized) : null },
    });
    return this.sanitize(business);
  }

  async getSerperKey(businessId: string): Promise<string | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { serperKeyEncrypted: true },
    });
    if (!business?.serperKeyEncrypted) return null;
    return decryptSecret(business.serperKeyEncrypted);
  }

  async update(businessId: string, data: UpdateBusinessDto) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existing) throw new NotFoundException('Negocio no encontrado');

    let mergedPos: Record<string, unknown> | undefined;
    try {
      mergedPos = mergePosConfigUpdate(existing.posConfig, {
        posConfig: data.posConfig,
        clearAiInvoiceWebhookSecret: data.clearAiInvoiceWebhookSecret,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Configuración inválida';
      throw new BadRequestException(msg);
    }

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.cuit !== undefined && { cuit: data.cuit }),
        ...(data.address !== undefined && { address: data.address }),
        ...(mergedPos !== undefined && { posConfig: mergedPos as any }),
      },
    });
    return this.sanitize(updated);
  }

  async listCategories(businessId: string) {
    return this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(businessId: string, name: string) {
    return this.prisma.category.create({
      data: { businessId, name },
    });
  }
}
