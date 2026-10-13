import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocKind, UserDoc } from './schemas/user-doc.schema.js';

/** A document as the app sees it: its JSON plus `id`, or a tombstone. */
export type SyncedDoc =
  ({ id: string } & Record<string, unknown>) | { id: string; deleted: true };

@Injectable()
export class UserDocsService implements OnModuleInit {
  constructor(
    @InjectModel(UserDoc.name) private readonly docs: Model<UserDoc>,
  ) {}

  /** The unique (user, kind, docId) index backs every upsert. */
  async onModuleInit() {
    await this.docs.createIndexes();
  }

  /**
   * Every document of [kind], tombstones included; with [since] (only
   * for date-keyed kinds), only ids from that day on.
   */
  async list(
    userId: string,
    kind: DocKind,
    since?: string,
  ): Promise<SyncedDoc[]> {
    const docs = await this.docs
      .find({
        userId: new Types.ObjectId(userId),
        kind,
        ...(since ? { docId: { $gte: since } } : {}),
      })
      .select({ docId: 1, data: 1, deleted: 1, _id: 0 })
      .sort({ docId: 1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      doc.deleted
        ? { id: doc.docId, deleted: true as const }
        : { ...doc.data, id: doc.docId },
    );
  }

  /** Creates or replaces [docs] (each with an `id`); clears tombstones. */
  async upsertMany(
    userId: string,
    kind: DocKind,
    docs: Array<{ id: string } & Record<string, unknown>>,
  ): Promise<void> {
    if (docs.length === 0) return;
    const owner = new Types.ObjectId(userId);
    await this.docs.bulkWrite(
      docs.map(({ id, ...data }) => ({
        updateOne: {
          filter: { userId: owner, kind, docId: id },
          update: { $set: { data, deleted: false } },
          upsert: true,
        },
      })),
    );
  }

  /** Replaces the document with a tombstone (creating one if absent). */
  async tombstone(userId: string, kind: DocKind, docId: string) {
    await this.docs
      .updateOne(
        { userId: new Types.ObjectId(userId), kind, docId },
        { $set: { data: {}, deleted: true } },
        { upsert: true },
      )
      .exec();
  }

  /** Hard-deletes all of the user's documents (account deletion). */
  async removeAllForUser(userId: string): Promise<void> {
    await this.docs.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
  }
}
