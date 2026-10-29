import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsTimeZone, Max, Min } from 'class-validator';

export class StatsQueryDto {
  /** How many days back, today included (default 30). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  /** IANA time zone the days are counted in (default UTC). */
  @IsOptional()
  @IsTimeZone()
  tz?: string;
}
