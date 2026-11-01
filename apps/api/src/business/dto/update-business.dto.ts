import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BusinessAiInvoiceDto {
  @IsOptional()
  @IsString()
  n8nWebhookUrl?: string;

  @IsOptional()
  @IsString()
  publicApiUrl?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class BusinessBrandingDto {
  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  ticketLogoUrl?: string;

  @IsOptional()
  @IsString()
  appTitle?: string;

  @IsOptional()
  @IsString()
  receiptName?: string;

  @IsOptional()
  @IsIn(['clasico', 'moderno'])
  receiptTemplate?: 'clasico' | 'moderno';

  @IsOptional()
  @IsString()
  linkColor?: string;

  @IsOptional()
  @IsString()
  primaryButtonColor?: string;

  @IsOptional()
  @IsString()
  focusRingColor?: string;

  @IsOptional()
  @IsString()
  navActiveColor?: string;

  @IsOptional()
  @IsString()
  selectionColor?: string;

  @IsOptional()
  @IsString()
  shadowTintColor?: string;
}

export class BusinessCustomerDisplayDto {
  @IsOptional()
  @IsString()
  mercadopagoAlias?: string;

  @IsOptional()
  @IsString()
  mercadopagoQrUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  promoImageUrls?: string[];
}

export class BusinessPantallasDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  dwellSec?: number;

  @IsOptional()
  transitionMs?: number;

  @IsOptional()
  @IsIn(['fade', 'slide', 'zoom'])
  animation?: 'fade' | 'slide' | 'zoom';

  @IsOptional()
  @IsIn(['cover', 'contain'])
  fit?: 'cover' | 'contain';

  @IsOptional()
  @IsString()
  shareToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  logoXPct?: number;

  @IsOptional()
  logoYPct?: number;

  @IsOptional()
  logoWidthPct?: number;

  @IsOptional()
  logoOpacityPct?: number;
}

export class BusinessPreciosClarosDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  lat?: number;

  @IsOptional()
  lng?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  branchIds?: string[];
}

export class BusinessPosConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenCategoryIds?: string[];

  @IsOptional()
  @IsString()
  silentItemLabel?: string;

  /** Fallback cross-device si falta PATCH /business/serper-key */
  @IsOptional()
  @IsString()
  serperKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessAiInvoiceDto)
  aiInvoice?: BusinessAiInvoiceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessBrandingDto)
  branding?: BusinessBrandingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessCustomerDisplayDto)
  customerDisplay?: BusinessCustomerDisplayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPantallasDto)
  pantallas?: BusinessPantallasDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPreciosClarosDto)
  preciosClaros?: BusinessPreciosClarosDto;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPosConfigDto)
  posConfig?: BusinessPosConfigDto;

  /** Si es true, borra el secreto guardado en BD (se puede usar el del servidor). */
  @IsOptional()
  @IsBoolean()
  clearAiInvoiceWebhookSecret?: boolean;
}
