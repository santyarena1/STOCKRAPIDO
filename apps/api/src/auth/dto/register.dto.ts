import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Mínimo 8 caracteres' })
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  businessName: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['mostrador', 'kiosco', 'red'])
  planId?: 'mostrador' | 'kiosco' | 'red';

  /** Obligatorio: aceptar compartir fichas en catálogo comunitario (solo campos no sensibles). */
  @IsBoolean()
  catalogShareConsent: boolean;
}
