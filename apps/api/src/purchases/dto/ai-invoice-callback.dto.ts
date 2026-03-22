import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AiInvoiceItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsNumber()
  @Type(() => Number)
  qty!: number;

  @IsNumber()
  @Type(() => Number)
  unitCost!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minStock?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class AiInvoiceCallbackDto {
  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiInvoiceItemDto)
  items!: AiInvoiceItemDto[];
}
