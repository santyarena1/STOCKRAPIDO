import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mergePosConfigUpdate, sanitizePosConfigForApi } from './pos-config.util';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async getByUser(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!b) return null;
    return {
      ...b,
      posConfig: sanitizePosConfigForApi(b.posConfig),
    };
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
    return {
      ...updated,
      posConfig: sanitizePosConfigForApi(updated.posConfig),
    };
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
