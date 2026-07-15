import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptFiscalSecret, encryptFiscalSecret } from './fiscal-crypto';
import { XMLParser } from 'fast-xml-parser';
import * as forge from 'node-forge';

const FACTURA_C = 11;
const WSFE_SERVICE = 'wsfe';
type Environment = 'homologation' | 'production';
type SaveConfig = {
  enabled?: boolean; environment: Environment; cuit: string; pointOfSale: number; legalName?: string;
  grossIncomeNumber?: string; activityStartDate?: string; address?: string; certificate?: string; privateKey?: string;
};

@Injectable()
export class FiscalService {
  private parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });
  constructor(private prisma: PrismaService) {}

  async getPublicConfig(businessId: string) {
    const c = await this.prisma.fiscalConfig.findUnique({ where: { businessId } });
    if (!c) return null;
    return { id: c.id, enabled: c.enabled, environment: c.environment, cuit: c.cuit, pointOfSale: c.pointOfSale,
      legalName: c.legalName, grossIncomeNumber: c.grossIncomeNumber, activityStartDate: c.activityStartDate,
      address: c.address, hasCertificate: !!c.certificateEncrypted, hasPrivateKey: !!c.privateKeyEncrypted,
      certificateExpiresAt: c.certificateExpiresAt };
  }

  async saveConfig(businessId: string, dto: SaveConfig) {
    const cuit = dto.cuit.replace(/\D/g, '');
    if (cuit.length !== 11) throw new BadRequestException('El CUIT debe tener 11 dígitos.');
    if (!Number.isInteger(dto.pointOfSale) || dto.pointOfSale < 1 || dto.pointOfSale > 99999) throw new BadRequestException('Punto de venta inválido.');
    if (!['homologation', 'production'].includes(dto.environment)) throw new BadRequestException('Ambiente inválido.');
    const previous = await this.prisma.fiscalConfig.findUnique({ where: { businessId } });
    let certificateEncrypted = previous?.certificateEncrypted;
    let privateKeyEncrypted = previous?.privateKeyEncrypted;
    let certificateExpiresAt = previous?.certificateExpiresAt;
    if (dto.certificate?.trim()) {
      try {
        const cert = forge.pki.certificateFromPem(dto.certificate.trim());
        certificateExpiresAt = cert.validity.notAfter;
        certificateEncrypted = encryptFiscalSecret(dto.certificate.trim());
      } catch { throw new BadRequestException('El certificado no es un PEM/X.509 válido.'); }
    }
    if (dto.privateKey?.trim()) {
      try { forge.pki.privateKeyFromPem(dto.privateKey.trim()); privateKeyEncrypted = encryptFiscalSecret(dto.privateKey.trim()); }
      catch { throw new BadRequestException('La clave privada no es un PEM válido.'); }
    }
    if (dto.certificate?.trim() && dto.privateKey?.trim()) this.validatePair(dto.certificate.trim(), dto.privateKey.trim());
    await this.prisma.fiscalConfig.upsert({ where: { businessId }, create: { businessId, enabled: !!dto.enabled,
      environment: dto.environment, cuit, pointOfSale: dto.pointOfSale, legalName: dto.legalName?.trim() || null,
      grossIncomeNumber: dto.grossIncomeNumber?.trim() || null, activityStartDate: dto.activityStartDate ? new Date(dto.activityStartDate) : null,
      address: dto.address?.trim() || null, certificateEncrypted, privateKeyEncrypted, certificateExpiresAt }, update: {
      enabled: !!dto.enabled, environment: dto.environment, cuit, pointOfSale: dto.pointOfSale, legalName: dto.legalName?.trim() || null,
      grossIncomeNumber: dto.grossIncomeNumber?.trim() || null, activityStartDate: dto.activityStartDate ? new Date(dto.activityStartDate) : null,
      address: dto.address?.trim() || null, certificateEncrypted, privateKeyEncrypted, certificateExpiresAt } });
    return this.getPublicConfig(businessId);
  }

  private validatePair(certPem: string, keyPem: string) {
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
      const certPublic = forge.pki.publicKeyToPem(cert.publicKey);
      const keyPublic = forge.pki.publicKeyToPem(forge.pki.rsa.setPublicKey(key.n, key.e));
      if (certPublic !== keyPublic) throw new Error();
    } catch { throw new BadRequestException('El certificado y la clave privada no corresponden entre sí.'); }
  }

  private async credentials(businessId: string) {
    const config = await this.prisma.fiscalConfig.findUnique({ where: { businessId } });
    if (!config) throw new BadRequestException('Configurá ARCA antes de emitir Factura C.');
    if (!config.certificateEncrypted || !config.privateKeyEncrypted) throw new BadRequestException('Falta cargar el certificado o la clave privada de ARCA.');
    return { config, cert: decryptFiscalSecret(config.certificateEncrypted), key: decryptFiscalSecret(config.privateKeyEncrypted) };
  }

  private endpoints(environment: string) {
    const prod = environment === 'production';
    return { wsaa: prod ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms' : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
      wsfe: prod ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' };
  }

  private createCms(certPem: string, keyPem: string) {
    const now = Date.now();
    const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId><generationTime>${new Date(now - 600000).toISOString()}</generationTime><expirationTime>${new Date(now + 600000).toISOString()}</expirationTime></header><service>${WSFE_SERVICE}</service></loginTicketRequest>`;
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);
    p7.addCertificate(cert);
    p7.addSigner({ key: forge.pki.privateKeyFromPem(keyPem), certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date().toISOString() }] });
    p7.sign();
    return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  }

  private async auth(businessId: string) {
    const { config, cert, key } = await this.credentials(businessId);
    const cms = this.createCms(cert, key);
    const xml = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><ser:loginCms><ser:in0>${cms}</ser:in0></ser:loginCms></soapenv:Body></soapenv:Envelope>`;
    const response = await fetch(this.endpoints(config.environment).wsaa, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'loginCms' }, body: xml, signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`WSAA respondió HTTP ${response.status}.`);
    const outer = this.parser.parse(text);
    const returned = outer?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
    if (!returned) throw new Error(this.soapError(outer) || 'WSAA no devolvió credenciales.');
    const login = this.parser.parse(returned)?.loginTicketResponse;
    if (!login?.credentials?.token || !login?.credentials?.sign) throw new Error('Respuesta de autenticación de ARCA inválida.');
    return { config, token: String(login.credentials.token), sign: String(login.credentials.sign) };
  }

  private soapError(parsed: any) { return parsed?.Envelope?.Body?.Fault?.faultstring || parsed?.Envelope?.Body?.Fault?.Reason?.Text; }
  private async wsfe(environment: string, action: string, body: string) {
    const envelope = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:${action}>${body}</ar:${action}></soap:Body></soap:Envelope>`;
    const response = await fetch(this.endpoints(environment).wsfe, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `http://ar.gov.afip.dif.FEV1/${action}` }, body: envelope, signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    const parsed = this.parser.parse(text);
    if (!response.ok || this.soapError(parsed)) throw new Error(this.soapError(parsed) || `WSFE respondió HTTP ${response.status}.`);
    return parsed?.Envelope?.Body?.[`${action}Response`]?.[`${action}Result`];
  }
  private authXml(a: { token: string; sign: string }, cuit: string) { return `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`; }

  async testConnection(businessId: string) {
    try {
      const { config, token, sign } = await this.auth(businessId);
      const result = await this.wsfe(config.environment, 'FECompUltimoAutorizado', `${this.authXml({ token, sign }, config.cuit)}<ar:PtoVta>${config.pointOfSale}</ar:PtoVta><ar:CbteTipo>${FACTURA_C}</ar:CbteTipo>`);
      const errors = this.collectErrors(result);
      if (errors) throw new Error(errors);
      return { ok: true, environment: config.environment, pointOfSale: config.pointOfSale, lastAuthorized: Number(result?.CbteNro || 0), message: 'Conexión y autorización con ARCA correctas.' };
    } catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'No se pudo conectar con ARCA.'); }
  }

  private collectErrors(result: any) {
    const raw = result?.Errors?.Err || result?.FeDetResp?.FECAEDetResponse?.Observaciones?.Obs;
    if (!raw) return '';
    return (Array.isArray(raw) ? raw : [raw]).map((x: any) => `${x.Code || x.Code === 0 ? `[${x.Code}] ` : ''}${x.Msg || ''}`).join(' · ');
  }

  async createInternal(businessId: string, saleId: string) {
    return this.prisma.fiscalDocument.upsert({ where: { saleId }, create: { businessId, saleId, kind: 'INTERNAL', status: 'INTERNAL' }, update: {} });
  }

  async issueFacturaC(businessId: string, saleId: string) {
    const existing = await this.prisma.fiscalDocument.findUnique({ where: { saleId } });
    if (existing?.status === 'AUTHORIZED') return existing;
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, businessId }, include: { items: { include: { product: true } } } });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    await this.prisma.fiscalDocument.upsert({ where: { saleId }, create: { businessId, saleId, kind: 'FACTURA_C', status: 'PENDING', receiptType: FACTURA_C }, update: { kind: 'FACTURA_C', status: 'PENDING', errorMessage: null } });
    try {
      const { config, token, sign } = await this.auth(businessId);
      if (!config.enabled) throw new Error('La facturación ARCA está desactivada en Configuración.');
      const authXml = this.authXml({ token, sign }, config.cuit);
      const last = await this.wsfe(config.environment, 'FECompUltimoAutorizado', `${authXml}<ar:PtoVta>${config.pointOfSale}</ar:PtoVta><ar:CbteTipo>${FACTURA_C}</ar:CbteTipo>`);
      const lastErrors = this.collectErrors(last); if (lastErrors) throw new Error(lastErrors);
      const number = Number(last?.CbteNro || 0) + 1;
      const amount = Number(sale.totalFinal).toFixed(2);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
      const request = `${authXml}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${config.pointOfSale}</ar:PtoVta><ar:CbteTipo>${FACTURA_C}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest><ar:Concepto>1</ar:Concepto><ar:DocTipo>99</ar:DocTipo><ar:DocNro>0</ar:DocNro><ar:CbteDesde>${number}</ar:CbteDesde><ar:CbteHasta>${number}</ar:CbteHasta><ar:CbteFch>${date}</ar:CbteFch><ar:ImpTotal>${amount}</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>${amount}</ar:ImpNeto><ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>0</ar:ImpIVA><ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId></ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
      const result = await this.wsfe(config.environment, 'FECAESolicitar', request);
      const detail = result?.FeDetResp?.FECAEDetResponse;
      const errors = this.collectErrors(result);
      if (result?.FeCabResp?.Resultado !== 'A' || detail?.Resultado !== 'A' || !detail?.CAE) throw new Error(errors || 'ARCA rechazó el comprobante sin detalle.');
      const cae = String(detail.CAE); const dueRaw = String(detail.CAEFchVto);
      const due = new Date(`${dueRaw.slice(0,4)}-${dueRaw.slice(4,6)}-${dueRaw.slice(6,8)}T00:00:00-03:00`);
      const qrData = { ver: 1, fecha: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`, cuit: Number(config.cuit), ptoVta: config.pointOfSale,
        tipoCmp: FACTURA_C, nroCmp: number, importe: Number(amount), moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: Number(cae) };
      const qrPayload = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrData)).toString('base64')}`;
      return await this.prisma.fiscalDocument.update({ where: { saleId }, data: { status: 'AUTHORIZED', pointOfSale: config.pointOfSale, receiptNumber: number, cae, caeExpiresAt: due, qrPayload, arcaResult: result as any, errorMessage: null } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error desconocido al emitir en ARCA.';
      return this.prisma.fiscalDocument.update({ where: { saleId }, data: { status: 'ERROR', errorMessage: message } });
    }
  }

  async receipt(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, businessId }, include: { items: { include: { product: true } }, fiscalDocument: true, business: { select: { name: true, cuit: true, address: true, fiscalConfig: true } } } });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    const fc = sale.business.fiscalConfig;
    return { id: sale.id, createdAt: sale.createdAt, total: sale.total, discount: sale.discount, totalFinal: sale.totalFinal, paymentMethod: sale.paymentMethod,
      items: sale.items.map(i => ({ name: i.product?.name || i.productName || 'Producto', qty: i.qty, unitPrice: i.unitPrice, subtotal: i.subtotal })),
      business: { name: fc?.legalName || sale.business.name, cuit: fc?.cuit || sale.business.cuit, address: fc?.address || sale.business.address,
        grossIncomeNumber: fc?.grossIncomeNumber, activityStartDate: fc?.activityStartDate }, fiscalDocument: sale.fiscalDocument };
  }
}