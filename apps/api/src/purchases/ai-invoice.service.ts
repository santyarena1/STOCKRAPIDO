import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { readAiInvoiceFromPosConfig } from '../business/pos-config.util';
import { PrismaService } from '../prisma/prisma.service';
import { AiInvoiceCallbackDto } from './dto/ai-invoice-callback.dto';

export type AiInvoiceItemResult = {
  productId?: string;
  productName?: string;
  barcode?: string;
  categoryId?: string;
  qty: number;
  unitCost: number;
  price?: number;
  minStock?: number;
  expiresAt?: string;
};

export type AiInvoiceJobStatus = 'pending' | 'completed' | 'failed';

type JobRecord = {
  businessId: string;
  status: AiInvoiceJobStatus;
  filename: string;
  createdAt: number;
  result?: { supplierId: string; items: AiInvoiceItemResult[] };
  error?: string;
};

const JOB_TTL_MS = 60 * 60 * 1000;

export type UploadedInvoiceFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class AiInvoiceService {
  private readonly jobs = new Map<string, JobRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    setInterval(() => this.gc(), 5 * 60 * 1000).unref?.();
  }

  private gc() {
    const now = Date.now();
    for (const [id, j] of this.jobs) {
      if (now - j.createdAt > JOB_TTL_MS) this.jobs.delete(id);
    }
  }

  private async loadAiInvoiceSettings(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { posConfig: true },
    });
    return readAiInvoiceFromPosConfig(b?.posConfig);
  }

  private async getPublicApiBaseUrl(businessId: string): Promise<string> {
    const settings = await this.loadAiInvoiceSettings(businessId);
    const fromDb = settings.publicApiUrl?.trim();
    const fromEnv = this.config.get<string>('PUBLIC_API_URL')?.trim();
    return (fromDb || fromEnv || `http://localhost:${this.config.get<string>('PORT') || '4002'}`).replace(
      /\/$/,
      '',
    );
  }

  async createJobFromUpload(
    businessId: string,
    file: UploadedInvoiceFile,
    options?: { sendOnly?: boolean },
  ): Promise<
    | { jobId: string }
    | { sendOnly: true; n8nHttpStatus: number; message: string }
  > {
    const sendOnly = !!options?.sendOnly;
    const s = await this.loadAiInvoiceSettings(businessId);
    const n8nUrl =
      s.n8nWebhookUrl?.trim() || this.config.get<string>('N8N_INVOICE_WEBHOOK_URL')?.trim();
    if (!n8nUrl) {
      throw new ServiceUnavailableException(
        'Configurá la URL del webhook de N8N en Configuración → Compras con IA (o la variable N8N_INVOICE_WEBHOOK_URL en el servidor).',
      );
    }
    if (!sendOnly) {
      const secret =
        s.webhookSecret?.trim() || this.config.get<string>('AI_INVOICE_WEBHOOK_SECRET')?.trim();
      if (!secret) {
        throw new ServiceUnavailableException(
          'Configurá el secreto del callback en Configuración → Compras con IA (o AI_INVOICE_WEBHOOK_SECRET en el servidor).',
        );
      }
    }

    const jobId = randomUUID();
    const filename = file.originalname || 'factura';
    const mimeType = file.mimetype || 'application/octet-stream';
    const fileBase64 = file.buffer.toString('base64');

    const callbackUrl = `${await this.getPublicApiBaseUrl(businessId)}/purchases/ai-invoice/callback`;

    const payload: Record<string, unknown> = {
      jobId,
      businessId,
      callbackUrl,
      filename,
      mimeType,
      fileBase64,
    };
    if (sendOnly) {
      payload.sendOnly = true;
    }

    if (!sendOnly) {
      this.jobs.set(jobId, {
        businessId,
        status: 'pending',
        filename,
        createdAt: Date.now(),
      });
    }

    try {
      const res = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (!sendOnly) {
          this.jobs.set(jobId, {
            businessId,
            status: 'failed',
            filename,
            createdAt: Date.now(),
            error: `N8N respondió ${res.status}: ${text.slice(0, 500)}`,
          });
        }
        throw new BadRequestException(
          `El webhook de N8N falló (${res.status}). Revisá el flujo en N8N.`,
        );
      }
      if (sendOnly) {
        return {
          sendOnly: true,
          n8nHttpStatus: res.status,
          message:
            'N8N respondió OK. La factura se envió; no se guardó trabajo de espera ni hace falta callback para esta prueba.',
        };
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      if (!sendOnly) {
        this.jobs.set(jobId, {
          businessId,
          status: 'failed',
          filename,
          createdAt: Date.now(),
          error: msg,
        });
      }
      throw new BadRequestException(`No se pudo contactar a N8N: ${msg}`);
    }

    return { jobId };
  }

  getJobForBusiness(jobId: string, businessId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('Trabajo no encontrado o expirado.');
    if (job.businessId !== businessId) throw new ForbiddenException();
    return job;
  }

  async applyCallback(
    headers: Record<string, string | string[] | undefined>,
    dto: AiInvoiceCallbackDto,
  ) {
    const job = this.jobs.get(dto.jobId);
    if (!job) throw new NotFoundException('jobId no encontrado o expirado.');
    if (job.status !== 'pending') {
      throw new BadRequestException('Este trabajo ya fue procesado.');
    }

    const s = await this.loadAiInvoiceSettings(job.businessId);
    const effectiveSecret =
      s.webhookSecret?.trim() || this.config.get<string>('AI_INVOICE_WEBHOOK_SECRET')?.trim();
    if (!effectiveSecret) {
      throw new ServiceUnavailableException(
        'Secreto de callback no configurado (Configuración o AI_INVOICE_WEBHOOK_SECRET).',
      );
    }
    const headerSecret =
      (typeof headers['x-webhook-secret'] === 'string' && headers['x-webhook-secret']) ||
      (typeof headers['X-Webhook-Secret'] === 'string' && headers['X-Webhook-Secret']) ||
      '';
    if (headerSecret !== effectiveSecret) {
      throw new ForbiddenException('Secreto de webhook inválido.');
    }

    const supplierId = await this.resolveSupplierId(job.businessId, dto);
    if (!supplierId) {
      job.status = 'failed';
      job.error =
        'No se pudo determinar el proveedor: enviá supplierId o supplierName que exista en el negocio.';
      return { ok: true, jobId: dto.jobId, status: job.status };
    }

    const items: AiInvoiceItemResult[] = (dto.items || []).map((i) => ({
      productId: i.productId,
      productName: i.productName,
      barcode: i.barcode,
      categoryId: i.categoryId,
      qty: Number(i.qty),
      unitCost: Number(i.unitCost),
      price: i.price != null ? Number(i.price) : undefined,
      minStock: i.minStock != null ? Number(i.minStock) : undefined,
      expiresAt: i.expiresAt,
    }));

    const valid = items.filter(
      (i) => i.qty > 0 && (i.productId || (i.productName && i.productName.trim())),
    );
    if (valid.length === 0) {
      job.status = 'failed';
      job.error = 'La lista de ítems está vacía o no tiene cantidad/producto válidos.';
      return { ok: true, jobId: dto.jobId, status: job.status };
    }

    job.status = 'completed';
    job.result = { supplierId, items: valid };
    return { ok: true, jobId: dto.jobId, status: 'completed' as const };
  }

  private async resolveSupplierId(
    businessId: string,
    dto: AiInvoiceCallbackDto,
  ): Promise<string | null> {
    if (dto.supplierId?.trim()) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId.trim(), businessId },
      });
      return s ? s.id : null;
    }
    const name = dto.supplierName?.trim();
    if (!name) return null;
    const lower = name.toLowerCase();
    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });
    const found = suppliers.find((s) => s.name.toLowerCase() === lower);
    return found?.id ?? null;
  }
}
