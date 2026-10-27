import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** The `/api/ai` routes that call OpenAI (status checks are not logged). */
export const AI_FEATURES = [
  'generate',
  'workout-plan',
  'meal-plan',
  'food-photo',
  'form-review',
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** How long usage entries are kept before MongoDB's TTL monitor drops them. */
export const AI_USAGE_RETENTION_DAYS = 180;

/**
 * One call to an AI route, for the admin web's usage page. Prompts,
 * photos and answers are never stored — only who, what, when, how long
 * and whether it failed.
 */
@Schema()
export class AiUsage {
  /** The caller, or null when the request carried no valid access token. */
  @Prop({ type: Types.ObjectId, default: null })
  userId: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: AI_FEATURES })
  feature: AiFeature;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  ok: boolean;

  /** The error code the app saw (`rate-limited`, `timeout`, …); null if ok. */
  @Prop({ type: String, default: null })
  errorCode: string | null;

  @Prop({ required: true, min: 0 })
  durationMs: number;

  @Prop({
    type: Date,
    default: () => new Date(),
    expires: AI_USAGE_RETENTION_DAYS * 24 * 60 * 60,
  })
  createdAt: Date;
}

export type AiUsageDocument = HydratedDocument<AiUsage>;

export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);
AiUsageSchema.index({ userId: 1, createdAt: -1 });
