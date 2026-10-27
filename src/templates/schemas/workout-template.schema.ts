import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** The levels and categories the app's filters and workout builder offer. */
export const TEMPLATE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
export const TEMPLATE_CATEGORIES = ['Strength', 'Cardio', 'Mobility'];

/** The app casts these fields `as int`, so fractions would break parsing. */
const integer = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
};

/** One exercise of a template (mirrors the app's `Exercise` JSON). */
@Schema({ _id: false })
export class TemplateExercise {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  muscleGroup: string;

  @Prop({ required: true, min: 1, validate: integer })
  sets: number;

  @Prop({ default: 0, min: 0, validate: integer })
  reps: number;

  @Prop({ default: 0, min: 0, validate: integer })
  durationSeconds: number;

  @Prop({ default: 45, min: 0, validate: integer })
  restSeconds: number;

  @Prop({ default: 0, min: 0 })
  weightKg: number;
}

const TemplateExerciseSchema = SchemaFactory.createForClass(TemplateExercise);

// Rep-based or timed — exactly one of the two.
TemplateExerciseSchema.pre('validate', function () {
  if (this.reps > 0 === this.durationSeconds > 0) {
    this.invalidate(
      'reps',
      'An exercise needs either reps or durationSeconds, not both',
    );
  }
});

/**
 * A built-in workout plan, readable by everyone (replaces the Firestore
 * `workouts` collection). `_id` is the app's stable string id, e.g.
 * `full-body-foundation`; `order` is the display order.
 */
@Schema({
  timestamps: true,
  toJSON: {
    // The app's Workout JSON: `id` instead of `_id`, no bookkeeping fields.
    transform: (_, ret: Record<string, unknown>) => {
      const { _id, order, createdAt, updatedAt, __v, ...template } = ret;
      void order;
      void createdAt;
      void updatedAt;
      void __v;
      return { id: _id, ...template };
    },
  },
})
export class WorkoutTemplate {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 1, validate: integer })
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

  createdAt: Date;
  updatedAt: Date;
}

export type WorkoutTemplateDocument = HydratedDocument<WorkoutTemplate>;

export const WorkoutTemplateSchema =
  SchemaFactory.createForClass(WorkoutTemplate);
