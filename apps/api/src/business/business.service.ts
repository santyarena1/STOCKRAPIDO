import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isTeatroTenant } from '../common/teatro';
import {
  PANTALLAS_DEFAULT_DWELL_SEC,
  PANTALLAS_DEFAULT_TRANSITION_MS,
  mergePosConfigUpdate,
  sanitizePosConfigForApi,
  type PantallasPosConfig,
} from './pos-config.util';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { decryptSecret, encryptSecret } from '../fiscal/fiscal-crypto';

export type OnboardingState = {
  completedSteps: string[];
  skippedSteps: string[];
  tourVersion: number;
  finishedAt: string | null;
  dismissedChecklist?: boolean;
};

export const ONBOARDING_STEPS = ['brand', 'categories', 'first_product', 'open_caja', 'first_sale'] as const;

export function defaultOnboarding(): OnboardingState {
  return { completedSteps: [], skippedSteps: [], tourVersion: 2, finishedAt: null };
}

function parseOnboarding(raw: unknown): OnboardingState {
  const base = defaultOnboarding();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<OnboardingState>;
  return {
    completedSteps: Array.isArray(o.completedSteps) ? o.completedSteps.filter((s) => typeof s === 'string') : [],
    skippedSteps: Array.isArray(o.skippedSteps) ? o.skippedSteps.filter((s) => typeof s === 'string') : [],
    tourVersion: typeof o.tourVersion === 'number' ? o.tourVersion : 2,
    finishedAt: typeof o.finishedAt === 'string' ? o.finishedAt : null,
    dismissedChecklist: Boolean(o.dismissedChecklist),
  };
}

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

  private newPantallasToken() {
    return randomBytes(24).toString('base64url');
  }

  async update(businessId: string, data: UpdateBusinessDto) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existing) throw new NotFoundException('Negocio no encontrado');

    if (data.posConfig?.pantallas) {
      if (!isTeatroTenant(existing.name, existing.id)) {
        throw new ForbiddenException('Pantallas solo está habilitado para el tenant Teatro.');
      }
      const prevP =
        existing.posConfig && typeof existing.posConfig === 'object'
          ? (existing.posConfig as Record<string, unknown>).pantallas
          : null;
      const prevToken =
        prevP && typeof prevP === 'object' && typeof (prevP as PantallasPosConfig).shareToken === 'string'
          ? (prevP as PantallasPosConfig).shareToken
          : undefined;
      const incoming = data.posConfig.pantallas;
      if (!incoming.shareToken && !prevToken) {
        incoming.shareToken = this.newPantallasToken();
      } else if (!incoming.shareToken && prevToken) {
        incoming.shareToken = prevToken;
      }
    }

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

  /** Regenera el token público de Pantallas (solo Teatro). */
  async regeneratePantallasToken(businessId: string) {
    const existing = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!existing) throw new NotFoundException('Negocio no encontrado');
    if (!isTeatroTenant(existing.name, existing.id)) {
      throw new ForbiddenException('Pantallas solo está habilitado para el tenant Teatro.');
    }
    const base =
      existing.posConfig && typeof existing.posConfig === 'object'
        ? { ...(existing.posConfig as Record<string, unknown>) }
        : {};
    const prev =
      base.pantallas && typeof base.pantallas === 'object'
        ? { ...(base.pantallas as Record<string, unknown>) }
        : {};
    prev.shareToken = this.newPantallasToken();
    base.pantallas = prev;
    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: { posConfig: base as any },
    });
    return this.sanitize(updated);
  }

  /** Vista pública del slideshow (sin auth). */
  async getPantallasByToken(token: string) {
    const clean = String(token ?? '').trim();
    if (!clean || clean.length < 8) throw new NotFoundException('Pantalla no encontrada');
    const business = await this.prisma.business.findFirst({
      where: {
        posConfig: {
          path: ['pantallas', 'shareToken'],
          equals: clean,
        },
      },
      select: { id: true, name: true, posConfig: true },
    });
    if (!business) throw new NotFoundException('Pantalla no encontrada');
    if (!isTeatroTenant(business.name, business.id)) {
      throw new NotFoundException('Pantalla no encontrada');
    }
    const raw =
      business.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>).pantallas
        : null;
    const p = raw && typeof raw === 'object' ? (raw as PantallasPosConfig) : {};
    if (p.enabled === false) {
      throw new NotFoundException('Pantalla desactivada');
    }
    const imageUrls = Array.isArray(p.imageUrls)
      ? p.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    return {
      businessName: business.name,
      imageUrls,
      dwellSec:
        typeof p.dwellSec === 'number' && Number.isFinite(p.dwellSec)
          ? p.dwellSec
          : PANTALLAS_DEFAULT_DWELL_SEC,
      transitionMs:
        typeof p.transitionMs === 'number' && Number.isFinite(p.transitionMs)
          ? p.transitionMs
          : PANTALLAS_DEFAULT_TRANSITION_MS,
      animation: p.animation === 'slide' || p.animation === 'zoom' ? p.animation : 'fade',
      fit: p.fit === 'contain' ? 'contain' : 'cover',
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

  async getOnboarding(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { onboarding: true },
    });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    const state = parseOnboarding(b.onboarding);
    const pending = ONBOARDING_STEPS.filter(
      (s) => !state.completedSteps.includes(s) && !state.skippedSteps.includes(s),
    );
    return { ...state, pending, totalSteps: ONBOARDING_STEPS.length };
  }

  async patchOnboarding(
    businessId: string,
    patch: { completeStep?: string; skipStep?: string; dismissChecklist?: boolean; finish?: boolean },
  ) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    const state = parseOnboarding(b.onboarding);

    if (patch.completeStep) {
      if (!ONBOARDING_STEPS.includes(patch.completeStep as (typeof ONBOARDING_STEPS)[number])) {
        throw new BadRequestException('Paso de onboarding inválido.');
      }
      if (!state.completedSteps.includes(patch.completeStep)) {
        state.completedSteps.push(patch.completeStep);
      }
      state.skippedSteps = state.skippedSteps.filter((s) => s !== patch.completeStep);
    }

    if (patch.skipStep) {
      if (!ONBOARDING_STEPS.includes(patch.skipStep as (typeof ONBOARDING_STEPS)[number])) {
        throw new BadRequestException('Paso de onboarding inválido.');
      }
      if (!state.skippedSteps.includes(patch.skipStep)) {
        state.skippedSteps.push(patch.skipStep);
      }
    }

    if (patch.dismissChecklist) state.dismissedChecklist = true;

    const allDone = ONBOARDING_STEPS.every(
      (s) => state.completedSteps.includes(s) || state.skippedSteps.includes(s),
    );
    if (patch.finish || allDone) {
      state.finishedAt = new Date().toISOString();
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: { onboarding: state as object },
    });

    return this.getOnboarding(businessId);
  }

  async acceptCatalogShareConsent(businessId: string) {
    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: { catalogShareConsentAt: new Date() },
    });
    return this.sanitize(updated);
  }
}
