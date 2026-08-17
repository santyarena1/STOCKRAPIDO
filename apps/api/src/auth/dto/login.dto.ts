import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Usuario o email. Acepta `admin` sin @. */
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString({ message: 'Ingresá usuario o email' })
  @MinLength(1)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
