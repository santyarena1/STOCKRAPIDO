import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateBusinessPlanDto {
  @IsOptional()
  @IsIn(['mostrador', 'kiosco', 'red'])
  planId?: 'mostrador' | 'kiosco' | 'red';

  @IsOptional()
  @IsIn(['trial', 'active', 'pending_payment', 'past_due', 'canceled'])
  planStatus?: 'trial' | 'active' | 'pending_payment' | 'past_due' | 'canceled';

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
