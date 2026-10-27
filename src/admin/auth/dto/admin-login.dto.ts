import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  /** Capped so a huge body cannot make scrypt hash megabytes. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
