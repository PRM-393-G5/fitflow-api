import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One exercise of a template (mirrors the app's `Exercise` JSON). */
@Schema({ _id: false })
export class TemplateExercise {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  muscleGroup: string;

  @Prop({ required: true, min: 1 })
  sets: number;

  @Prop({ default: 0, min: 0 })
  reps: number;

  @Prop({ default: 0, min: 0 })
  durationSeconds: number;

  @Prop({ default: 45, min: 0 })
  restSeconds: number;

  @Prop({ default: 0, min: 0 })
  weightKg: number;
}

const TemplateExerciseSchema = SchemaFactory.createForClass(TemplateExercise);

/**
 * A built-in workout plan, readable by everyone (replaces the Firestore
 * `workouts` collection). `_id` is the app's stable string id, e.g.
 * `full-body-foundation`; `order` is the display order.
 */
@Schema({ timestamps: true })
export class WorkoutTemplate {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  @Prop({ required: true })
  level: string;

  @Prop({ required: true })
  category: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [TemplateExerciseSchema], default: [] })
  exercises: TemplateExercise[];

  @Prop({ default: 0, index: true })
  order: number;
}

export type WorkoutTemplateDocument = HydratedDocument<WorkoutTemplate>;

export const WorkoutTemplateSchema =
  SchemaFactory.createForClass(WorkoutTemplate);
