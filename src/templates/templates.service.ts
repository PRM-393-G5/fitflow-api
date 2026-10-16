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

  /**
   * All templates in display order. Documents are hydrated (not lean) so
   * schema defaults fill fields missing from older documents, and the
   * schema's toJSON gives the app's shape.
   */
  async findAll(): Promise<TemplateJson[]> {
    const docs = await this.templates.find().sort({ order: 1, _id: 1 }).exec();
    return docs.map((doc) => doc.toJSON() as unknown as TemplateJson);
  }

  /**
   * Makes the collection match [templates]: upserts each one (its position
   * becomes `order`) and deletes templates no longer listed. Everything is
   * validated before the first write, so bad seed data changes nothing.
   * The writes themselves are not one transaction (a standalone MongoDB
   * has none): a reader may briefly see new and stale templates together.
   */
  async replaceAll(
    templates: TemplateJson[],
  ): Promise<{ upserted: number; deleted: number }> {
    const ids = templates.map((template) => template.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Template ids must be unique');
    }
    const docs = templates.map(
      ({ id, ...template }, order) =>
        new this.templates({ _id: id, ...template, order }),
    );
    await Promise.all(docs.map((doc) => doc.validate()));

    if (docs.length > 0) {
      await this.templates.bulkWrite(
        docs.map((doc) => {
          const { _id, ...fields } = doc.toObject({ versionKey: false });
          // $set (not a replacement) keeps createdAt on re-seeds.
          return {
            updateOne: {
              filter: { _id },
              update: { $set: fields },
              upsert: true,
            },
          };
        }),
      );
    }
    const { deletedCount } = await this.templates
      .deleteMany({ _id: { $nin: ids } })
      .exec();
    return { upserted: templates.length, deleted: deletedCount };
  }
}
