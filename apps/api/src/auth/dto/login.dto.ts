import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MinLength(1)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
