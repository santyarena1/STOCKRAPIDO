import { IsOptional, IsString } from 'class-validator';

export class SetApiKeyDto {
  @IsOptional()
  @IsString()
  key?: string;
}
