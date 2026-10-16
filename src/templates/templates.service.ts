import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TemplateExercise,
  WorkoutTemplate,
} from './schemas/workout-template.schema.js';

/** Template as the app's `Workout.fromJson` reads it. */
export interface TemplateJson {
  id: string;
  name: string;
  durationMinutes: number;
  level: string;
  category: string;
  description: string;
  exercises: TemplateExercise[];
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(WorkoutTemplate.name)
    private readonly templates: Model<WorkoutTemplate>,
  ) {}

  /** All templates in display order. */
  async findAll(): Promise<TemplateJson[]> {
    const docs = await this.templates
      .find()
      .sort({ order: 1, _id: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: doc._id,
      name: doc.name,
      durationMinutes: doc.durationMinutes,
      level: doc.level,
      category: doc.category,
      description: doc.description,
      exercises: doc.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        sets: exercise.sets,
        reps: exercise.reps,
        durationSeconds: exercise.durationSeconds,
        restSeconds: exercise.restSeconds,
        weightKg: exercise.weightKg,
      })),
    }));
  }
}
