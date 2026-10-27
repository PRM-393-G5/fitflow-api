import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const USER_STATUSES = ['all', 'active', 'locked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export class ListUsersQueryDto {
  /** Case-insensitive part of the email or name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateUserDto {
  /** True locks the account, false unlocks it. */
  @IsBoolean()
  disabled: boolean;
}
