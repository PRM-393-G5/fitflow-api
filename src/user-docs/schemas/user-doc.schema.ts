import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Per-user collections the app syncs (were `users/{uid}/{kind}`). */
export const DOC_KINDS = ['sessions', 'workouts', 'weights', 'meals'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/**
 * One synced document: a workout session, custom workout, body-weight
 * entry or one logged meal (`meals`, id `yyyy-mm-dd:<entry>`), stored as
 * the app's JSON in `data`. Deletes are soft
 * (`deleted: true`, empty `data`) so another device's merge cannot
 * resurrect the document.
 */
@Schema({ timestamps: true })
export class UserDoc {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: DOC_KINDS })
  kind: DocKind;

  @Prop({ required: true })
  docId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  data: Record<string, unknown>;

  @Prop({ default: false })
  deleted: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocDocument = HydratedDocument<UserDoc>;

export const UserDocSchema = SchemaFactory.createForClass(UserDoc);
UserDocSchema.index({ userId: 1, kind: 1, docId: 1 }, { unique: true });
