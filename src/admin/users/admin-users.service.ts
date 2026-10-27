import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isObjectIdOrHexString, Model, Types } from 'mongoose';
import { AccountService } from '../../auth/account.service.js';
import { TokensService } from '../../auth/tokens/tokens.service.js';
import { UserDoc } from '../../user-docs/schemas/user-doc.schema.js';
import type { DocKind } from '../../user-docs/schemas/user-doc.schema.js';
import { User } from '../../users/schemas/user.schema.js';
import type { ListUsersQueryDto } from './dto/admin-users.dto.js';

/** `workoutId` of form-check results, which sync as sessions. */
export const FORM_CHECK_WORKOUT_ID = 'form-check';

const RECENT_SESSIONS = 10;

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  photoUrl: string | null;
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  /** Finished workouts; form-check results are not counted. */
  sessionCount: number;
}

export interface UserPage {
  items: AdminUserSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface RecentSession {
  id: string;
  workoutName: string | null;
  /**
   * As the app wrote it: usually the phone's local time without an
   * offset (`2026-10-27T18:00:00.000`), so show it as is, not converted.
   */
  completedAt: string | null;
  minutes: number;
  completedSets: number;
  volumeKg: number;
  formCheck: boolean;
}

/** Values from the app's synced profile meta; null when not set. */
export interface UserTrainingProfile {
  goal: string | null;
  level: string | null;
  weeklyGoal: number | null;
  heightCm: number | null;
  age: number | null;
  isMale: boolean | null;
  activityLevel: number | string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  profile: UserTrainingProfile | null;
  /** Live (not deleted) synced documents; `formChecks` split from sessions. */
  counts: Record<DocKind | 'formChecks', number>;
  /** Over finished workouts, form checks excluded (as the app counts). */
  totals: { minutes: number; volumeKg: number };
  latestWeightKg: number | null;
  /** When any synced document last changed. */
  lastSyncAt: string | null;
  recentSessions: RecentSession[];
}

type LeanUser = User & { _id: Types.ObjectId };

/** The fields of a synced document the detail view reads. */
interface DocFields {
  kind: DocKind;
  docId: string;
  deleted: boolean;
  updatedAt: Date;
  data: Record<string, unknown>;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(UserDoc.name) private readonly docs: Model<UserDoc>,
    private readonly tokens: TokensService,
    private readonly account: AccountService,
  ) {}

  /** Newest accounts first, filtered by [query.search] and [query.status]. */
  async list(query: ListUsersQueryDto): Promise<UserPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    const search = query.search?.trim();
    if (search) {
      const pattern = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [{ email: pattern }, { name: pattern }];
    }
    // Accounts created before locking existed have no `disabled` field.
    if (query.status === 'active') filter.disabled = { $ne: true };
    if (query.status === 'locked') filter.disabled = true;

    const [total, users] = await Promise.all([
      this.users.countDocuments(filter).exec(),
      this.users
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select({ meta: 0 })
        .lean<LeanUser[]>()
        .exec(),
    ]);
    const counts = await this.sessionCounts(users.map((user) => user._id));
    return {
      items: users.map((user) =>
        toSummary(user, counts.get(user._id.toString()) ?? 0),
      ),
      total,
      page,
      limit,
    };
  }

  async detail(id: string): Promise<AdminUserDetail | null> {
    if (!isObjectIdOrHexString(id)) return null;
    const user = await this.users.findById(id).lean<LeanUser>().exec();
    if (!user) return null;
    const docs = await this.docs
      .find({ userId: user._id })
      .select({
        _id: 0,
        kind: 1,
        docId: 1,
        deleted: 1,
        updatedAt: 1,
        'data.workoutId': 1,
        'data.workoutName': 1,
        'data.startedAt': 1,
        'data.completedAt': 1,
        'data.completedSets': 1,
        'data.volumeKg': 1,
        'data.weightKg': 1,
      })
      .lean<DocFields[]>()
      .exec();

    const live = docs.filter((doc) => !doc.deleted);
    const sessions = live
      .filter((doc) => doc.kind === 'sessions')
      .map((doc) => toRecentSession(doc));
    const workouts = sessions.filter((session) => !session.formCheck);
    const weights = live
      .filter((doc) => doc.kind === 'weights')
      .sort((a, b) => b.docId.localeCompare(a.docId));
    const lastSync = docs.reduce<Date | null>(
      (latest, doc) =>
        !latest || doc.updatedAt > latest ? doc.updatedAt : latest,
      null,
    );

    return {
      ...toSummary(user, workouts.length),
      profile: toTrainingProfile(user),
      counts: {
        sessions: workouts.length,
        formChecks: sessions.length - workouts.length,
        workouts: live.filter((doc) => doc.kind === 'workouts').length,
        weights: weights.length,
        meals: live.filter((doc) => doc.kind === 'meals').length,
      },
      totals: {
        minutes: sum(workouts.map((session) => session.minutes)),
        volumeKg: round1(sum(workouts.map((session) => session.volumeKg))),
      },
      latestWeightKg:
        weights.length > 0 ? numberOrNull(weights[0].data.weightKg) : null,
      lastSyncAt: lastSync?.toISOString() ?? null,
      recentSessions: sessions
        .sort((a, b) =>
          (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
        )
        .slice(0, RECENT_SESSIONS),
    };
  }

  /**
   * Locks or unlocks the account. Locking also ends every session: the
   * app's next refresh fails and it returns to the sign-in page.
   */
  async setDisabled(
    id: string,
    disabled: boolean,
  ): Promise<AdminUserSummary | null> {
    if (!isObjectIdOrHexString(id)) return null;
    const user = await this.users
      .findByIdAndUpdate(
        id,
        { $set: { disabled } },
        { returnDocument: 'after' },
      )
      .select({ meta: 0 })
      .lean<LeanUser>()
      .exec();
    if (!user) return null;
    if (disabled) await this.tokens.revokeAll(id);
    const counts = await this.sessionCounts([user._id]);
    return toSummary(user, counts.get(user._id.toString()) ?? 0);
  }

  /** Deletes the account with all its data; false if it did not exist. */
  remove(id: string): Promise<boolean> {
    return this.account.purge(id);
  }

  /** Finished workouts per user (form checks and tombstones excluded). */
  private async sessionCounts(
    userIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.docs
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            userId: { $in: userIds },
            kind: 'sessions',
            deleted: false,
            'data.workoutId': { $ne: FORM_CHECK_WORKOUT_ID },
          },
        },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }
}

function toSummary(user: LeanUser, sessionCount: number): AdminUserSummary {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name ?? null,
    photoUrl: user.photoUrl ?? null,
    disabled: user.disabled ?? false,
    createdAt: user.createdAt.toISOString(),
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    sessionCount,
  };
}

/**
 * Whole minutes, at least 1, like the app's `durationMinutes`. Both
 * strings are parsed alike, so their missing offset cancels out.
 */
export function sessionMinutes(startedAt: unknown, completedAt: unknown) {
  const ms = Date.parse(String(completedAt)) - Date.parse(String(startedAt));
  return Number.isNaN(ms) ? 1 : Math.max(1, Math.floor(ms / 60_000));
}

function toRecentSession(doc: DocFields): RecentSession {
  const { data } = doc;
  return {
    id: doc.docId,
    workoutName: stringOrNull(data.workoutName),
    completedAt: stringOrNull(data.completedAt),
    minutes: sessionMinutes(data.startedAt, data.completedAt),
    completedSets: numberOrNull(data.completedSets) ?? 0,
    volumeKg: numberOrNull(data.volumeKg) ?? 0,
    formCheck: data.workoutId === FORM_CHECK_WORKOUT_ID,
  };
}

/** Reads the app's meta blob (`profile`, `onboarding`, `weeklyGoal`). */
function toTrainingProfile(user: LeanUser): UserTrainingProfile | null {
  if (!user.metaUpdatedAt || !user.meta) return null;
  const meta = user.meta;
  const profile = asRecord(meta.profile);
  const onboarding = asRecord(meta.onboarding);
  const activity = profile.activityLevel;
  return {
    goal: stringOrNull(onboarding.goal),
    level: stringOrNull(onboarding.level),
    weeklyGoal: numberOrNull(meta.weeklyGoal),
    heightCm: numberOrNull(profile.heightCm),
    age: numberOrNull(profile.age),
    isMale: typeof profile.isMale === 'boolean' ? profile.isMale : null,
    activityLevel:
      typeof activity === 'number' || typeof activity === 'string'
        ? activity
        : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

const round1 = (value: number) => Math.round(value * 10) / 10;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
