import { IsIn, IsOptional, IsString } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @IsIn(['mostrador', 'kiosco', 'red'])
  planId: 'mostrador' | 'kiosco' | 'red';

  @IsString()
  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  @IsIn(['mercadopago', 'transfer'])
  method?: 'mercadopago' | 'transfer';
}
