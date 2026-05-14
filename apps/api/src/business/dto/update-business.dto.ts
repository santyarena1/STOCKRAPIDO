import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

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
  appTitle?: string;

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

export class BusinessPosConfigDto {
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
