import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WORKOUT_LEVELS } from '../prompts/ai-prompts.js';

export class GenerateJsonDto {
  @ApiProperty({ description: 'System instructions for the model.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  system: string;

  @ApiProperty({ description: 'User prompt text.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16000)
  user: string;

  @ApiProperty({
    description: 'Strict OpenAI JSON schema object.',
    type: Object,
  })
  @IsObject()
  schema: Record<string, unknown>;

  @ApiProperty({
    description: 'Schema identifier passed to response_format.json_schema.',
    example: 'workout_plan',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  schemaName: string;

  @ApiPropertyOptional({
    description: 'Optional reasoning effort for reasoning models.',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  reasoningEffort?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({
    description: 'Optional base64-encoded image (JPEG/PNG/WebP).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(6_000_000)
  imageBase64?: string;

  @ApiPropertyOptional({
    description: 'Optional MIME type for imageBase64 (sniffed when omitted).',
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  })
  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export class GenerateWorkoutPlanDto {
  @ApiProperty({
    description: 'Natural-language workout request from the user.',
    example: '45-minute dumbbell upper body workout',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  request: string;

  @ApiPropertyOptional({
    description: 'Optional difficulty level.',
    enum: [...WORKOUT_LEVELS],
  })
  @IsOptional()
  @IsIn([...WORKOUT_LEVELS])
  level?: string;

  @ApiPropertyOptional({
    description: 'Target workout duration in minutes (10-120).',
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Optional fitness goal.',
    example: 'Build muscle',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  goal?: string;
}

export class GenerateMealPlanDto {
  @ApiProperty({
    description: 'Daily calorie target in kcal.',
    example: 2200,
  })
  @IsInt()
  @Min(800)
  @Max(6000)
  targetKcal: number;

  @ApiProperty({
    description: 'Daily protein target in grams.',
    example: 150,
  })
  @IsInt()
  @Min(20)
  @Max(400)
  proteinG: number;

  @ApiProperty({
    description: 'Number of meals per day (3 or 4).',
    example: 4,
  })
  @IsInt()
  @Min(3)
  @Max(4)
  meals: number;

  @ApiPropertyOptional({
    description: 'Optional user fitness goal.',
    example: 'Lose fat',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  goal?: string;

  @ApiPropertyOptional({
    description: 'Dietary preferences or restrictions.',
    example: 'high protein, no shellfish',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  preferences?: string;
}

export class AnalyzeFoodPhotoDto {
  @ApiProperty({
    description: 'Base64-encoded food photo (JPEG/PNG/WebP).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6_000_000)
  imageBase64: string;

  @ApiPropertyOptional({
    description: 'Optional MIME type (auto-sniffed when omitted).',
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  })
  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export class RepTelemetryDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(200)
  number: number;

  @ApiProperty({ example: 84.5 })
  @IsNumber()
  @Min(0)
  @Max(180)
  minKneeAngle: number;

  @ApiProperty({ example: 1150 })
  @IsInt()
  @Min(0)
  @Max(60000)
  descentMs: number;

  @ApiProperty({ example: 920 })
  @IsInt()
  @Min(0)
  @Max(60000)
  ascentMs: number;

  @ApiProperty({ type: [String], example: ['kneeValgus'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  faults: string[];
}

export class ReviewFormDto {
  @ApiProperty({ example: 'Squat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  exercise: string;

  @ApiProperty({ type: [RepTelemetryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RepTelemetryDto)
  reps: RepTelemetryDto[];
}
