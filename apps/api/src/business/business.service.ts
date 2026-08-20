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
    const pos =
      business.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>)
        : null;
    const hasSerperInPos = Boolean(pos && typeof pos.serperKeyEncrypted === 'string' && pos.serperKeyEncrypted);
    const sanitizedPos = sanitizePosConfigForApi(business.posConfig);
    if (sanitizedPos && typeof sanitizedPos === 'object') {
      const copy = { ...(sanitizedPos as Record<string, unknown>) };
      delete copy.serperKeyEncrypted;
      return {
        ...safe,
        posConfig: copy,
        hasOpenaiKey: !!openaiKeyEncrypted,
        hasSerperKey: !!serperKeyEncrypted || hasSerperInPos,
      };
    }
    return {
      ...safe,
      posConfig: sanitizedPos,
      hasOpenaiKey: !!openaiKeyEncrypted,
      hasSerperKey: !!serperKeyEncrypted || hasSerperInPos,
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
    const encrypted = normalized ? encryptSecret(normalized) : null;
    try {
      const business = await this.prisma.business.update({
        where: { id: businessId },
        data: { serperKeyEncrypted: encrypted },
      });
      return this.sanitize(business);
    } catch {
      // Si la columna todavía no existe en prod, guardamos en posConfig (cross-device).
      const existing = await this.prisma.business.findUnique({ where: { id: businessId } });
      if (!existing) throw new NotFoundException('Negocio no encontrado');
      const prev =
        existing.posConfig && typeof existing.posConfig === 'object'
          ? { ...(existing.posConfig as Record<string, unknown>) }
          : {};
      if (encrypted) prev.serperKeyEncrypted = encrypted;
      else delete prev.serperKeyEncrypted;
      const business = await this.prisma.business.update({
        where: { id: businessId },
        data: { posConfig: prev as any },
      });
      return { ...this.sanitize(business), hasSerperKey: Boolean(normalized) };
    }
  }

  async getSerperKey(businessId: string): Promise<string | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { serperKeyEncrypted: true, posConfig: true },
    });
    if (!business) return null;
    if (business.serperKeyEncrypted) return decryptSecret(business.serperKeyEncrypted);
    const pos =
      business.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>)
        : null;
    const fromPos = pos && typeof pos.serperKeyEncrypted === 'string' ? pos.serperKeyEncrypted : null;
    if (!fromPos) return null;
    return decryptSecret(fromPos);
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
      if (mergedPos && '__serperKeyPlain' in mergedPos) {
        const plain = mergedPos.__serperKeyPlain;
        delete mergedPos.__serperKeyPlain;
        if (typeof plain === 'string' && plain.trim()) {
          mergedPos.serperKeyEncrypted = encryptSecret(plain.trim());
        } else {
          delete mergedPos.serperKeyEncrypted;
        }
      }
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
