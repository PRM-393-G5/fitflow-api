import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TemplateExercise,
  WorkoutTemplate,
  WorkoutTemplateDocument,
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

/** What the admin web sees: the app's shape plus when it last changed. */
export type AdminTemplateJson = TemplateJson & { updatedAt: string };

export type TemplateFields = Omit<TemplateJson, 'id'>;

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

  async findOne(id: string): Promise<AdminTemplateJson | null> {
    const doc = await this.templates.findById(id).exec();
    return doc && toAdminJson(doc);
  }

  /** All templates in display order, with `updatedAt`. */
  async findAllForAdmin(): Promise<AdminTemplateJson[]> {
    const docs = await this.templates.find().sort({ order: 1, _id: 1 }).exec();
    return docs.map(toAdminJson);
  }

  /** Adds [template] after the last one; 409 if the id is taken. */
  async create(template: TemplateJson): Promise<AdminTemplateJson> {
    const { id, ...fields } = template;
    assertExercises(fields.exercises);
    if (await this.templates.exists({ _id: id })) {
      throw new ConflictException(`Template ${id} already exists`);
    }
    const last = await this.templates
      .findOne()
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean()
      .exec();
    const doc = await new this.templates({
      _id: id,
      ...fields,
      order: (last?.order ?? -1) + 1,
    }).save();
    return toAdminJson(doc);
  }

  /** Replaces every field but the id and order; null if absent. */
  async update(
    id: string,
    fields: TemplateFields,
  ): Promise<AdminTemplateJson | null> {
    assertExercises(fields.exercises);
    const doc = await this.templates.findById(id).exec();
    if (!doc) return null;
    // save() (not an update query) runs the exercise pre-validate hook.
    doc.set(fields);
    return toAdminJson(await doc.save());
  }

  /** True when the template existed. */
  async remove(id: string): Promise<boolean> {
    const { deletedCount } = await this.templates.deleteOne({ _id: id }).exec();
    return deletedCount === 1;
  }

  /** Sets the display order; [ids] must list every template exactly once. */
  async reorder(ids: string[]): Promise<AdminTemplateJson[]> {
    const existing = await this.templates.find().select({ _id: 1 }).lean();
    const known = new Set(existing.map((doc) => doc._id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        'ids must list every template exactly once',
      );
    }
    if (ids.length > 0) {
      await this.templates.bulkWrite(
        ids.map((id, order) => ({
          updateOne: { filter: { _id: id }, update: { $set: { order } } },
        })),
        // Moving a template is not editing it: keep updatedAt.
        { timestamps: false },
      );
    }
    return this.findAllForAdmin();
  }

  /**
   * Loads [templates] into an empty collection; does nothing once any
   * template exists, since from then on the admin web owns them (edits,
   * deletions and order all survive). Upserts, so two concurrent first
   * seeds cannot fail on duplicate ids.
   */
  async seedIfEmpty(templates: TemplateJson[]): Promise<{ inserted: number }> {
    const docs = await this.validated(templates);
    if (docs.length === 0 || (await this.templates.countDocuments()) > 0) {
      return { inserted: 0 };
    }
    const result = await this.templates.bulkWrite(
      docs.map((doc) => {
        const { _id, ...fields } = doc.toObject({ versionKey: false });
        return {
          updateOne: {
            filter: { _id },
            update: { $setOnInsert: fields },
            upsert: true,
          },
        };
      }),
    );
    return { inserted: result.upsertedCount };
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
    const docs = await this.validated(templates);
    const ids = templates.map((template) => template.id);
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

  /**
   * Seed data as validated documents (position = order), checked like
   * admin input; throws if anything is wrong.
   */
  private async validated(
    templates: TemplateJson[],
  ): Promise<WorkoutTemplateDocument[]> {
    const ids = templates.map((template) => template.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Template ids must be unique');
    }
    templates.forEach((template) => assertExercises(template.exercises));
    const docs = templates.map(
      ({ id, ...template }, order) =>
        new this.templates({ _id: id, ...template, order }),
    );
    await Promise.all(docs.map((doc) => doc.validate()));
    return docs;
  }
}

function toAdminJson(doc: WorkoutTemplateDocument): AdminTemplateJson {
  return {
    ...(doc.toJSON() as unknown as TemplateJson),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Checks what the schema cannot report clearly: unique exercise ids
 * (the app keys progress by them) and reps XOR duration.
 */
function assertExercises(exercises: TemplateExercise[]): void {
  const ids = exercises.map((exercise) => exercise.id);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('Exercise ids must be unique in a template');
  }
  exercises.forEach((exercise, index) => {
    if (exercise.reps > 0 === exercise.durationSeconds > 0) {
      throw new BadRequestException(
        `exercises[${index}] needs either reps or durationSeconds, not both`,
      );
    }
  });
}
