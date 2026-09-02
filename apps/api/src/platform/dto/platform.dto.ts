import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateBusinessPlanDto {
  @IsOptional()
  @IsIn(['mostrador', 'kiosco', 'red'])
  planId?: 'mostrador' | 'kiosco' | 'red';

  @IsOptional()
  @IsIn(['trial', 'active', 'pending_payment', 'past_due', 'canceled', 'complimentary'])
  planStatus?: 'trial' | 'active' | 'pending_payment' | 'past_due' | 'canceled' | 'complimentary';

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  trialEndsAt?: string | null;
}

export class UpdateTicketStatusDto {
  @IsOptional()
  @IsIn(['open', 'in_progress', 'waiting', 'resolved', 'closed'])
  status?: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';

  @IsOptional()
  @IsIn(['low', 'normal', 'high'])
  priority?: 'low' | 'normal' | 'high';
}

export class UpsertPlatformSellerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsIn(['percent', 'fixed'])
  commissionType: 'percent' | 'fixed';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000000)
  commissionValue: number;
}

export class UpdatePlatformSellerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(['percent', 'fixed'])
  commissionType?: 'percent' | 'fixed';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000000)
  commissionValue?: number;
}

export class SellerLedgerDto {
  @IsIn(['payment', 'adjustment'])
  type: 'payment' | 'adjustment';

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  month?: number;
}

export class AssignSellerBusinessDto {
  @IsString()
  @MinLength(1)
  businessId: string;
}
