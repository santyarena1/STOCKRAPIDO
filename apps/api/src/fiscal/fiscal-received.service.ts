import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { XMLParser } from 'fast-xml-parser';
import * as forge from 'node-forge';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlanFeature, assertPlanFeatureRead } from '../billing/plan-guard';
import { parseArgentinaDayEnd, parseArgentinaDayStart } from '../common/argentina-date-range';
import { decryptFiscalSecret } from './fiscal-crypto';

const WSCDC_SERVICE = 'wscdc';

const VOUCHER_ALIASES: Record<string, number> = {
  'factura a': 1,
  'factura b': 6,
  'factura c': 11,
  'factura m': 51,
  'nota de debito a': 2,
  'nota de debito b': 7,
  'nota de debito c': 12,
  'nota de credito a': 3,
  'nota de credito b': 8,
  'nota de credito c': 13,
  'recibo a': 4,
  'recibo b': 9,
  'recibo c': 15,
};

type CsvRow = {
  issuedAt: Date;
  voucherType: string;
  voucherTypeCode: number | null;
  pointOfSale: number;
  numberFrom: number;
  numberTo: number;
  authCode: string | null;
  issuerDocType: string | null;
  issuerDocNumber: string;
  issuerName: string | null;
  currency: string;
  exchangeRate: number;
  netTaxed: number | null;
  netNotTaxed: number | null;
  exemptAmount: number | null;
  otherTaxes: number | null;
  vatAmount: number | null;
  totalAmount: number;
};

@Injectable()
export class FiscalReceivedService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  constructor(private prisma: PrismaService) {}

  async list(
    businessId: string,
    opts: { from?: Date; to?: Date; q?: string; status?: string; limit?: number } = {},
  ) {
    await assertPlanFeatureRead(this.prisma, businessId, 'fiscal');
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
    const where = this.buildWhere(businessId, opts);
    const [items, agg, config] = await Promise.all([
      this.prisma.fiscalReceivedInvoice.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { numberFrom: 'desc' }],
        take: limit,
      }),
      this.prisma.fiscalReceivedInvoice.aggregate({
        where,
        _count: true,
        _sum: { totalAmount: true, vatAmount: true },
      }),
      this.prisma.fiscalConfig.findUnique({
        where: { businessId },
        select: { cuit: true, enabled: true },
      }),
    ]);
    return {
      receptorCuit: config?.cuit ?? null,
      fiscalEnabled: !!config?.enabled,
      count: agg._count,
      totalAmount: Number(agg._sum.totalAmount ?? 0),
      totalVat: Number(agg._sum.vatAmount ?? 0),
      items: items.map((row) => this.serialize(row)),
    };
  }

  async summary(businessId: string, from?: Date, to?: Date) {
    await assertPlanFeatureRead(this.prisma, businessId, 'fiscal');
    const where = this.buildWhere(businessId, { from, to });
    const [agg, byStatus, topIssuers, rowsForMonths] = await Promise.all([
      this.prisma.fiscalReceivedInvoice.aggregate({
        where,
        _count: true,
        _sum: { totalAmount: true, vatAmount: true },
      }),
      this.prisma.fiscalReceivedInvoice.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.fiscalReceivedInvoice.groupBy({
        by: ['issuerDocNumber', 'issuerName'],
        where,
        _count: true,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 8,
      }),
      this.prisma.fiscalReceivedInvoice.findMany({
        where,
        select: { issuedAt: true, totalAmount: true, vatAmount: true },
        orderBy: { issuedAt: 'asc' },
      }),
    ]);

    const byMonthMap = new Map<string, { month: string; count: number; totalAmount: number; totalVat: number }>();
    for (const row of rowsForMonths) {
      const d = new Date(row.issuedAt);
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const current = byMonthMap.get(month) ?? { month, count: 0, totalAmount: 0, totalVat: 0 };
      current.count += 1;
      current.totalAmount += Number(row.totalAmount);
      current.totalVat += Number(row.vatAmount ?? 0);
      byMonthMap.set(month, current);
    }

    return {
      count: agg._count,
      totalAmount: Number(agg._sum.totalAmount ?? 0),
      totalVat: Number(agg._sum.vatAmount ?? 0),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count,
        totalAmount: Number(s._sum.totalAmount ?? 0),
      })),
      byMonth: [...byMonthMap.values()],
      topIssuers: topIssuers.map((s) => ({
        issuerDocNumber: s.issuerDocNumber,
        issuerName: s.issuerName,
        count: s._count,
        totalAmount: Number(s._sum.totalAmount ?? 0),
      })),
    };
  }

  async importCsv(businessId: string, csvText: string) {
    await assertPlanFeature(this.prisma, businessId, 'fiscal');
    if (!csvText?.trim()) {
      throw new BadRequestException('Pegá o subí el CSV de ARCA → Mis Comprobantes → Recibidos.');
    }
    const rows = this.parseMisComprobantesCsv(csvText);
    if (!rows.length) {
      throw new BadRequestException('No se encontraron filas válidas en el CSV.');
    }

    const batchId = randomUUID();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        const existing = await this.prisma.fiscalReceivedInvoice.findFirst({
          where: {
            businessId,
            issuerDocNumber: row.issuerDocNumber,
            pointOfSale: row.pointOfSale,
            numberFrom: row.numberFrom,
            ...(row.voucherTypeCode != null
              ? { voucherTypeCode: row.voucherTypeCode }
              : { voucherType: row.voucherType }),
          },
        });

        const payload = {
          issuedAt: row.issuedAt,
          voucherType: row.voucherType,
          voucherTypeCode: row.voucherTypeCode,
          pointOfSale: row.pointOfSale,
          numberFrom: row.numberFrom,
          numberTo: row.numberTo,
          authCode: row.authCode,
          issuerDocType: row.issuerDocType,
          issuerDocNumber: row.issuerDocNumber,
          issuerName: row.issuerName,
          currency: row.currency,
          exchangeRate: row.exchangeRate,
          netTaxed: row.netTaxed,
          netNotTaxed: row.netNotTaxed,
          exemptAmount: row.exemptAmount,
          otherTaxes: row.otherTaxes,
          vatAmount: row.vatAmount,
          totalAmount: row.totalAmount,
          source: 'csv',
          importBatchId: batchId,
        };

        if (existing) {
          await this.prisma.fiscalReceivedInvoice.update({
            where: { id: existing.id },
            data: {
              ...payload,
              status: existing.status === 'verified' ? existing.status : 'imported',
            },
          });
          updated += 1;
        } else {
          await this.prisma.fiscalReceivedInvoice.create({
            data: { businessId, ...payload, status: 'imported' },
          });
          created += 1;
        }
      } catch (err) {
        skipped += 1;
        errors.push(`Fila ${index + 2}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }

    return { batchId, parsed: rows.length, created, updated, skipped, errors: errors.slice(0, 25) };
  }

  async remove(businessId: string, id: string) {
    await assertPlanFeature(this.prisma, businessId, 'fiscal');
    const row = await this.prisma.fiscalReceivedInvoice.findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException('Comprobante no encontrado');
    await this.prisma.fiscalReceivedInvoice.delete({ where: { id } });
    return { ok: true };
  }

  async clear(businessId: string) {
    await assertPlanFeature(this.prisma, businessId, 'fiscal');
    const result = await this.prisma.fiscalReceivedInvoice.deleteMany({ where: { businessId } });
    return { deleted: result.count };
  }

  async verify(businessId: string, id: string) {
    await assertPlanFeature(this.prisma, businessId, 'fiscal');
    const row = await this.prisma.fiscalReceivedInvoice.findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException('Comprobante no encontrado');
    if (!row.authCode) throw new BadRequestException('Falta el código de autorización (CAE/CAEA).');
    if (row.voucherTypeCode == null) {
      throw new BadRequestException('Falta el código de tipo de comprobante para constatar en ARCA.');
    }

    const config = await this.prisma.fiscalConfig.findUnique({ where: { businessId } });
    if (!config?.certificateEncrypted || !config.privateKeyEncrypted) {
      throw new BadRequestException('Configurá el certificado ARCA en Config → Fiscal.');
    }

    try {
      const auth = await this.authWscdc(config);
      const body = `${this.authXml(auth, config.cuit)}
        <ar:CmpDatos>
          <ar:CbteModo>CAE</ar:CbteModo>
          <ar:CuitEmisor>${row.issuerDocNumber}</ar:CuitEmisor>
          <ar:PtoVta>${row.pointOfSale}</ar:PtoVta>
          <ar:CbteTipo>${row.voucherTypeCode}</ar:CbteTipo>
          <ar:CbteNro>${row.numberFrom}</ar:CbteNro>
          <ar:CbteFch>${this.formatAfipDate(row.issuedAt)}</ar:CbteFch>
          <ar:ImpTotal>${Number(row.totalAmount).toFixed(2)}</ar:ImpTotal>
          <ar:CodAutorizacion>${row.authCode}</ar:CodAutorizacion>
          <ar:DocTipoReceptor>80</ar:DocTipoReceptor>
          <ar:DocNroReceptor>${config.cuit}</ar:DocNroReceptor>
        </ar:CmpDatos>`;

      const result = await this.callWscdc(config.environment, 'ComprobanteConstatar', body);
      const payload = result?.ComprobanteConstatarResult ?? result;
      const resultado = String(payload?.Resultado ?? payload?.CmpResp?.Resultado ?? '').toUpperCase();
      const errors = this.collectErrors(payload);
      const ok = resultado === 'A' || (!errors && resultado !== 'R' && resultado !== 'REJECTED');

      const updated = await this.prisma.fiscalReceivedInvoice.update({
        where: { id: row.id },
        data: {
          status: ok ? 'verified' : 'mismatch',
          verifyResult: payload as Prisma.InputJsonValue,
          verifyMessage: ok
            ? 'Constatado OK en ARCA (WSCDC)'
            : errors || `Resultado ARCA: ${resultado || 'desconocido'}`,
          verifiedAt: new Date(),
        },
      });
      return this.serialize(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo constatar en ARCA';
      const updated = await this.prisma.fiscalReceivedInvoice.update({
        where: { id: row.id },
        data: { status: 'error', verifyMessage: message, verifiedAt: new Date() },
      });
      return this.serialize(updated);
    }
  }

  async verifyMany(businessId: string, ids: string[]) {
    const unique = [...new Set((ids ?? []).filter(Boolean))].slice(0, 25);
    if (!unique.length) throw new BadRequestException('Seleccioná al menos un comprobante.');
    const results: Array<Awaited<ReturnType<FiscalReceivedService['verify']>>> = [];
    for (const id of unique) results.push(await this.verify(businessId, id));
    return { results };
  }

  parseMisComprobantesCsv(raw: string): CsvRow[] {
    const text = raw.replace(/^\uFEFF/, '').trim();
    const delimiter = this.detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0], delimiter).map((h) => this.normalizeHeader(h));
    const map = this.mapHeaders(headers);
    if (map.issuedAt < 0 || map.issuerDocNumber < 0 || map.totalAmount < 0 || map.pointOfSale < 0) {
      throw new BadRequestException(
        'El CSV no tiene columnas de Mis Comprobantes (Fecha, Punto de Venta, Doc. Emisor, Imp. Total).',
      );
    }

    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i], delimiter);
      if (cols.every((c) => !c.trim())) continue;

      const issuedAt = this.parseDate(cols[map.issuedAt]);
      const issuerDocNumber = this.digitsOnly(cols[map.issuerDocNumber]);
      const pointOfSale = this.parseIntSafe(cols[map.pointOfSale]);
      const numberFrom = this.parseIntSafe(cols[map.numberFrom >= 0 ? map.numberFrom : map.numberTo]);
      const numberTo = this.parseIntSafe(
        cols[map.numberTo >= 0 ? map.numberTo : map.numberFrom],
        numberFrom ?? undefined,
      );
      const totalAmount = this.parseMoney(cols[map.totalAmount]);
      if (!issuedAt || !issuerDocNumber || pointOfSale == null || numberFrom == null || totalAmount == null) continue;

      const voucherRaw = map.voucherType >= 0 ? cols[map.voucherType] : '';
      const { label, code } = this.parseVoucherType(
        voucherRaw,
        map.voucherTypeCode >= 0 ? cols[map.voucherTypeCode] : undefined,
      );

      rows.push({
        issuedAt,
        voucherType: label || voucherRaw || 'Comprobante',
        voucherTypeCode: code,
        pointOfSale,
        numberFrom,
        numberTo: numberTo ?? numberFrom,
        authCode: map.authCode >= 0 ? cols[map.authCode]?.trim() || null : null,
        issuerDocType: map.issuerDocType >= 0 ? cols[map.issuerDocType]?.trim() || null : null,
        issuerDocNumber,
        issuerName: map.issuerName >= 0 ? cols[map.issuerName]?.trim() || null : null,
        currency: map.currency >= 0 ? cols[map.currency]?.trim() || 'PES' : 'PES',
        exchangeRate: map.exchangeRate >= 0 ? this.parseMoney(cols[map.exchangeRate]) ?? 1 : 1,
        netTaxed: map.netTaxed >= 0 ? this.parseMoney(cols[map.netTaxed]) : null,
        netNotTaxed: map.netNotTaxed >= 0 ? this.parseMoney(cols[map.netNotTaxed]) : null,
        exemptAmount: map.exemptAmount >= 0 ? this.parseMoney(cols[map.exemptAmount]) : null,
        otherTaxes: map.otherTaxes >= 0 ? this.parseMoney(cols[map.otherTaxes]) : null,
        vatAmount: map.vatAmount >= 0 ? this.parseMoney(cols[map.vatAmount]) : null,
        totalAmount,
      });
    }
    return rows;
  }

  private buildWhere(
    businessId: string,
    opts: { from?: Date; to?: Date; q?: string; status?: string },
  ): Prisma.FiscalReceivedInvoiceWhereInput {
    return {
      businessId,
      ...(opts.from || opts.to
        ? {
            issuedAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.q?.trim()
        ? {
            OR: [
              { issuerName: { contains: opts.q.trim(), mode: 'insensitive' } },
              { issuerDocNumber: { contains: opts.q.trim() } },
              { authCode: { contains: opts.q.trim() } },
              { voucherType: { contains: opts.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private mapHeaders(headers: string[]) {
    const find = (...candidates: string[]) =>
      headers.findIndex((h) => candidates.some((c) => h.includes(c)));
    return {
      issuedAt: find('fecha de emision', 'fecha emision', 'fecha'),
      voucherType: find('tipo de comprobante', 'tipo comprobante', 'tipo'),
      voucherTypeCode: find('cod tipo', 'codigo tipo', 'cod. tipo'),
      pointOfSale: find('punto de venta', 'pto venta', 'pto. de venta', 'punto venta'),
      numberFrom: find('numero desde', 'nro desde', 'nro. desde', 'numero de', 'nro comprobante'),
      numberTo: find('numero hasta', 'nro hasta', 'nro. hasta'),
      authCode: find('cod autorizacion', 'codigo autorizacion', 'cae', 'caea', 'cod. autorizacion'),
      issuerDocType: find('tipo doc emisor', 'tipo documento emisor', 'tipo doc. emisor'),
      issuerDocNumber: find(
        'nro doc emisor',
        'nro. doc. emisor',
        'cuit emisor',
        'doc emisor',
        'nro doc. emisor',
      ),
      issuerName: find('denominacion emisor', 'razon social', 'nombre emisor', 'denominacion'),
      currency: find('moneda'),
      exchangeRate: find('tipo cambio', 'tipo de cambio'),
      netTaxed: find('imp neto gravado', 'neto gravado', 'imp. neto gravado'),
      netNotTaxed: find('imp neto no gravado', 'neto no gravado', 'imp. neto no gravado'),
      exemptAmount: find('imp op exentas', 'exento', 'imp. op. exentas'),
      otherTaxes: find('otros tributos', 'otros impuestos'),
      vatAmount: find('iva'),
      totalAmount: find('imp total', 'importe total', 'imp. total', 'total'),
    };
  }

  private normalizeHeader(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/["']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private detectDelimiter(text: string) {
    const first = text.split(/\r?\n/)[0] || '';
    const semis = (first.match(/;/g) || []).length;
    const commas = (first.match(/,/g) || []).length;
    return semis >= commas ? ';' : ',';
  }

  private splitCsvLine(line: string, delimiter: string) {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = !inQuotes;
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  private parseDate(value?: string) {
    if (!value?.trim()) return null;
    const v = value.trim();
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const iso = new Date(v);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  private parseIntSafe(value?: string, fallback?: number) {
    if (value == null || value === '') return fallback ?? null;
    const n = Number(String(value).replace(/[^\d-]/g, ''));
    return Number.isFinite(n) ? Math.trunc(n) : fallback ?? null;
  }

  private parseMoney(value?: string) {
    if (value == null || value.trim() === '') return null;
    let v = value.trim().replace(/[$\s]/g, '');
    if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.');
    else if (v.includes(',')) v = v.replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private digitsOnly(value?: string) {
    return (value || '').replace(/\D/g, '');
  }

  private parseVoucherType(raw: string, codeRaw?: string) {
    const fromCode = this.parseIntSafe(codeRaw);
    if (fromCode != null) return { code: fromCode, label: raw?.trim() || `Tipo ${fromCode}` };
    const text = this.normalizeHeader(raw || '');
    const leading = text.match(/^(\d+)\b/);
    if (leading) return { code: Number(leading[1]), label: raw.trim() };
    for (const [alias, code] of Object.entries(VOUCHER_ALIASES)) {
      if (text.includes(alias)) return { code, label: raw.trim() || alias };
    }
    return { code: null, label: raw?.trim() || 'Comprobante' };
  }

  private formatAfipDate(date: Date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private serialize(row: {
    id: string;
    issuedAt: Date;
    voucherType: string;
    voucherTypeCode: number | null;
    pointOfSale: number;
    numberFrom: number;
    numberTo: number;
    authCode: string | null;
    issuerDocType: string | null;
    issuerDocNumber: string;
    issuerName: string | null;
    currency: string;
    exchangeRate: Prisma.Decimal | number;
    netTaxed: Prisma.Decimal | number | null;
    netNotTaxed: Prisma.Decimal | number | null;
    exemptAmount: Prisma.Decimal | number | null;
    otherTaxes: Prisma.Decimal | number | null;
    vatAmount: Prisma.Decimal | number | null;
    totalAmount: Prisma.Decimal | number;
    status: string;
    verifyMessage: string | null;
    verifiedAt: Date | null;
    source: string;
    importBatchId: string | null;
    notes: string | null;
    createdAt: Date;
  }) {
    const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
    return {
      id: row.id,
      issuedAt: row.issuedAt,
      voucherType: row.voucherType,
      voucherTypeCode: row.voucherTypeCode,
      pointOfSale: row.pointOfSale,
      numberFrom: row.numberFrom,
      numberTo: row.numberTo,
      authCode: row.authCode,
      issuerDocType: row.issuerDocType,
      issuerDocNumber: row.issuerDocNumber,
      issuerName: row.issuerName,
      currency: row.currency,
      exchangeRate: Number(row.exchangeRate),
      netTaxed: num(row.netTaxed),
      netNotTaxed: num(row.netNotTaxed),
      exemptAmount: num(row.exemptAmount),
      otherTaxes: num(row.otherTaxes),
      vatAmount: num(row.vatAmount),
      totalAmount: Number(row.totalAmount),
      status: row.status,
      verifyMessage: row.verifyMessage,
      verifiedAt: row.verifiedAt,
      source: row.source,
      importBatchId: row.importBatchId,
      notes: row.notes,
      createdAt: row.createdAt,
    };
  }

  private endpoints(environment: string) {
    const prod = environment === 'production';
    return {
      wsaa: prod
        ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
        : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
      wscdc: prod
        ? 'https://servicios1.afip.gov.ar/WSCDC/service.asmx'
        : 'https://wswhomo.afip.gov.ar/WSCDC/service.asmx',
    };
  }

  private postSoap(url: string, soapAction: string, body: string): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const request = httpsRequest(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || 443,
          ciphers: 'DEFAULT@SECLEVEL=1',
          path: `${target.pathname}${target.search}`,
          method: 'POST',
          family: 4,
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: `"${soapAction}"`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 25000,
        },
        (response) => {
          response.setEncoding('utf8');
          let text = '';
          response.on('data', (chunk) => {
            text += chunk;
          });
          response.on('end', () => resolve({ status: response.statusCode || 0, text }));
        },
      );
      request.on('timeout', () => request.destroy(new Error('Tiempo de espera agotado al conectar con ARCA.')));
      request.on('error', (error: NodeJS.ErrnoException) =>
        reject(new Error(`No se pudo conectar con ARCA${error.code ? ` (${error.code})` : ''}: ${error.message}`)),
      );
      request.end(body);
    });
  }

  private createCms(certPem: string, keyPem: string, service: string) {
    const now = Date.now();
    const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId><generationTime>${new Date(now - 600000).toISOString()}</generationTime><expirationTime>${new Date(now + 600000).toISOString()}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);
    p7.addCertificate(cert);
    p7.addSigner({
      key: forge.pki.privateKeyFromPem(keyPem),
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() as never },
      ],
    });
    p7.sign();
    return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  }

  private async authWscdc(config: {
    environment: string;
    certificateEncrypted: string | null;
    privateKeyEncrypted: string | null;
  }) {
    if (!config.certificateEncrypted || !config.privateKeyEncrypted) {
      throw new BadRequestException('Falta certificado ARCA');
    }
    const cert = decryptFiscalSecret(config.certificateEncrypted);
    const key = decryptFiscalSecret(config.privateKeyEncrypted);
    const cms = this.createCms(cert, key, WSCDC_SERVICE);
    const xml = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><ser:loginCms><ser:in0>${cms}</ser:in0></ser:loginCms></soapenv:Body></soapenv:Envelope>`;
    const response = await this.postSoap(this.endpoints(config.environment).wsaa, 'loginCms', xml);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`WSAA (wscdc) respondió HTTP ${response.status}.`);
    }
    const outer = this.parser.parse(response.text);
    const returned = outer?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
    if (!returned) throw new Error(this.soapError(outer) || 'WSAA no devolvió ticket para WSCDC.');
    const login = this.parser.parse(returned)?.loginTicketResponse;
    if (!login?.credentials?.token || !login?.credentials?.sign) {
      throw new Error(
        'Ticket WSAA inválido para WSCDC. Habilitá el servicio “wscdc” (Constatación de Comprobantes) en ARCA para este certificado.',
      );
    }
    return { token: String(login.credentials.token), sign: String(login.credentials.sign) };
  }

  private authXml(a: { token: string; sign: string }, cuit: string) {
    return `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
  }

  private async callWscdc(environment: string, action: string, body: string) {
    const envelope = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://servicios1.afip.gob.ar/wscdc/"><soap:Body><ar:${action}>${body}</ar:${action}></soap:Body></soap:Envelope>`;
    const response = await this.postSoap(
      this.endpoints(environment).wscdc,
      `http://servicios1.afip.gob.ar/wscdc/${action}`,
      envelope,
    );
    const parsed = this.parser.parse(response.text);
    if (response.status < 200 || response.status >= 300 || this.soapError(parsed)) {
      throw new Error(this.soapError(parsed) || `WSCDC respondió HTTP ${response.status}.`);
    }
    return parsed?.Envelope?.Body?.[`${action}Response`] ?? parsed?.Envelope?.Body;
  }

  private soapError(parsed: unknown) {
    const p = parsed as {
      Envelope?: { Body?: { Fault?: { faultstring?: string; Reason?: { Text?: string } } } };
    };
    return p?.Envelope?.Body?.Fault?.faultstring || p?.Envelope?.Body?.Fault?.Reason?.Text;
  }

  private collectErrors(result: unknown) {
    const r = result as { Errors?: { Err?: unknown }; Observations?: { Obs?: unknown } };
    const raw = r?.Errors?.Err || r?.Observations?.Obs;
    if (!raw) return '';
    return (Array.isArray(raw) ? raw : [raw])
      .map((x: { Code?: string | number; Msg?: string }) => `${x.Code != null ? `[${x.Code}] ` : ''}${x.Msg || ''}`)
      .join(' · ');
  }
}

export function receivedDateRange(from?: string, to?: string) {
  return {
    from: from ? parseArgentinaDayStart(from) ?? undefined : undefined,
    to: to ? parseArgentinaDayEnd(to) ?? undefined : undefined,
  };
}
