import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

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

export class BusinessPosConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessAiInvoiceDto)
  aiInvoice?: BusinessAiInvoiceDto;
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
