import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(4)
  @MaxLength(160)
  subject: string;

  @IsOptional()
  @IsIn(['pago', 'bug', 'cuenta', 'otro'])
  category?: 'pago' | 'bug' | 'cuenta' | 'otro';

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  body: string;
}

export class TicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}
