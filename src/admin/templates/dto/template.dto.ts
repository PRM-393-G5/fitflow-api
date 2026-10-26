import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_LEVELS,
} from '../../../templates/schemas/workout-template.schema.js';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/**
 * Lowercase words joined by `-`. `custom-…` ids are the app's own plans
 * and `form-check` marks form-check results, so neither may be used.
 */
export const TEMPLATE_ID_PATTERN =
  /^(?!custom-)(?!form-check$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXERCISE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class TemplateExerciseDto {
  @Matches(EXERCISE_ID_PATTERN, { message: 'id has an invalid format' })
  id: string;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  muscleGroup: string;

  @IsInt()
  @Min(1)
  @Max(20)
  sets: number;

  /** Reps per set; 0 for a timed exercise. */
  @IsInt()
  @Min(0)
  @Max(200)
  reps: number;

  /** Seconds per set; 0 for a rep-based exercise. */
  @IsInt()
  @Min(0)
  @Max(3600)
  durationSeconds: number;

  @IsInt()
  @Min(0)
  @Max(900)
  restSeconds: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(500)
  weightKg: number;
}

/** Everything of a template except its id (the body of PUT). */
export class TemplateBodyDto {
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes: number;

  @IsIn(TEMPLATE_LEVELS)
  level: string;

  @IsIn(TEMPLATE_CATEGORIES)
  category: string;

  @trim
  @IsString()
  @MaxLength(500)
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TemplateExerciseDto)
  exercises: TemplateExerciseDto[];
}

export class CreateTemplateDto extends TemplateBodyDto {
  @MaxLength(64)
  @Matches(TEMPLATE_ID_PATTERN, {
    message:
      'id must be lowercase words joined by "-" and not start with "custom-" or be "form-check"',
  })
  id: string;
}

export class ReorderTemplatesDto {
  /** Every template id, in the new display order. */
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids: string[];
}
