import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../accounts/password.js';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  /** Capped so a huge body cannot make scrypt hash megabytes. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
