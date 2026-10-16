import { IsInt, IsObject, Max, Min } from 'class-validator';

export class PutMetaDto {
  /** Client timestamp (epoch ms) of the change; must beat the stored one. */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  updatedAt: number;

  /** Profile, schedule, onboarding and weekly goal, as the app sends them. */
  @IsObject()
  meta: Record<string, unknown>;
}
