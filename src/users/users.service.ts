import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isObjectIdOrHexString, Model, mongo } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';

/** Identity fields taken from a verified Google ID token. */
export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  photoUrl?: string;
  /** When Google issued the ID token (epoch seconds). */
  issuedAt?: number;
}

/** The app's profile/schedule/onboarding blob and its client timestamp. */
export interface MetaState {
  /** Epoch milliseconds of the last accepted write; 0 = never written. */
  updatedAt: number;
  meta: Record<string, unknown> | null;
}

/** What the API exposes about a user. */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  photoUrl: string | null;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  /**
   * Builds the unique googleSub index before the app serves requests —
   * autoIndex runs in the background, and without the index two racing
   * first sign-ins would create duplicate accounts. Fails startup if the
   * index cannot be built (e.g. duplicates already exist).
   */
  async onModuleInit() {
    await this.users.createIndexes();
  }

  /**
   * Finds the account for a Google identity, creating it on first sign-in.
   * Name, email and photo are refreshed from Google on every sign-in.
   */
  async upsertFromGoogle(profile: GoogleProfile): Promise<UserDocument> {
    if (!profile.sub || !profile.email) {
      throw new Error('Google profile needs both sub and email');
    }
    const upsert = () =>
      this.users
        .findOneAndUpdate(
          { googleSub: profile.sub },
          {
            $set: {
              email: profile.email,
              // null (not undefined, which Mongoose drops) so a name or
              // photo removed on Google is cleared here too.
              name: profile.name ?? null,
              photoUrl: profile.photoUrl ?? null,
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
            runValidators: true,
          },
        )
        .orFail();
    try {
      return await upsert();
    } catch (error) {
      // Two first sign-ins raced to insert; the other one won — update it.
      if (
        error instanceof mongo.MongoServerError &&
        error.code === 11000 &&
        error.keyPattern?.googleSub !== undefined
      ) {
        return upsert();
      }
      throw error;
    }
  }

  /** The user with [id], or null when absent or [id] is malformed. */
  async findById(id: string): Promise<UserDocument | null> {
    if (!isObjectIdOrHexString(id)) return null;
    return this.users.findById(id).exec();
  }

  /** Like [requireActive], reading only the lock flag. */
  async assertActive(id: string): Promise<void> {
    const user = isObjectIdOrHexString(id)
      ? await this.users.findById(id).select({ disabled: 1 }).lean().exec()
      : null;
    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.disabled) throw new UnauthorizedException('Account is locked');
  }

  /** Whether the account [id] exists. */
  async exists(id: string): Promise<boolean> {
    return (
      isObjectIdOrHexString(id) &&
      (await this.users.exists({ _id: id })) !== null
    );
  }

  /** Stamps a sign-in that opened a session (not a refused one). */
  async recordSignIn(id: string): Promise<void> {
    await this.users
      .updateOne({ _id: id }, { $set: { lastSignInAt: new Date() } })
      .exec();
  }

  /**
   * The account [id] if it exists and is not locked; otherwise 401, which
   * makes the app drop its session and show the sign-in page.
   */
  async requireActive(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.disabled) throw new UnauthorizedException('Account is locked');
    return user;
  }

  /** Deletes the account document; true when it existed. */
  async remove(id: string): Promise<boolean> {
    if (!isObjectIdOrHexString(id)) return false;
    const result = await this.users.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }

  /** The stored meta blob, or null when the account no longer exists. */
  async getMeta(id: string): Promise<MetaState | null> {
    const user = await this.findById(id);
    if (!user) return null;
    return {
      updatedAt: user.metaUpdatedAt,
      meta: user.metaUpdatedAt > 0 ? user.meta : null,
    };
  }

  /**
   * Last-write-wins: stores [meta] only if [updatedAt] is newer than the
   * stored timestamp. One atomic pipeline update both decides and writes,
   * and returns the previous state, so the reported winner is exactly the
   * state this write lost to. Null if the account no longer exists.
   */
  async putMeta(
    id: string,
    updatedAt: number,
    meta: Record<string, unknown>,
  ): Promise<{ applied: boolean; state: MetaState } | null> {
    if (!isObjectIdOrHexString(id)) return null;
    const newer = { $lt: ['$metaUpdatedAt', updatedAt] };
    const before = await this.users
      .findOneAndUpdate(
        { _id: id },
        [
          {
            $set: {
              // $literal: string values like "$x" must not be read as paths.
              meta: { $cond: [newer, { $literal: meta }, '$meta'] },
              metaUpdatedAt: { $max: ['$metaUpdatedAt', updatedAt] },
            },
          },
        ],
        { returnDocument: 'before', updatePipeline: true },
      )
      .lean()
      .exec();
    if (!before) return null;
    if (before.metaUpdatedAt < updatedAt) {
      return { applied: true, state: { updatedAt, meta } };
    }
    return {
      applied: false,
      state: {
        updatedAt: before.metaUpdatedAt,
        meta: before.metaUpdatedAt > 0 ? before.meta : null,
      },
    };
  }

  static toProfile(user: UserDocument): UserProfile {
    return {
      id: user.id as string,
      email: user.email,
      name: user.name,
      photoUrl: user.photoUrl,
    };
  }
}
