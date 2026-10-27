import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../../ai/ai.service.js';
import { AiUsage } from '../../ai/schemas/ai-usage.schema.js';
import type { AiFeature } from '../../ai/schemas/ai-usage.schema.js';
import { WorkoutTemplate } from '../../templates/schemas/workout-template.schema.js';
import { UserDoc } from '../../user-docs/schemas/user-doc.schema.js';
import { User } from '../../users/schemas/user.schema.js';
import { FORM_CHECK_WORKOUT_ID } from '../users/admin-users.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The largest UTC offset in use (Kiribati, +14:00). */
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;
const RECENT_AI_CALLS = 50;
const TOP_AI_USERS = 10;

/** The days a report covers, `yyyy-mm-dd` in [tz], [to] being today. */
export interface StatsRange {
  days: number;
  tz: string;
  from: string;
  to: string;
}

export interface DailyActivity {
  date: string;
  newUsers: number;
  /** Finished workouts (form checks counted separately). */
  sessions: number;
  formChecks: number;
  aiCalls: number;
  aiErrors: number;
}

export interface StatsOverview {
  range: StatsRange;
  users: {
    total: number;
    locked: number;
    /** Signed up in the range. */
    new: number;
    /** Finished a workout or form check in the range. */
    active: number;
  };
  sessions: {
    /** All finished workouts ever synced. */
    total: number;
    inRange: number;
    minutesInRange: number;
    formChecksInRange: number;
  };
  ai: { calls: number; errors: number };
  templates: number;
  daily: DailyActivity[];
}

export interface AiUsageUser {
  id: string;
  /** Null once the account has been deleted. */
  email: string | null;
  name: string | null;
}

export interface AiUsageReport {
  range: StatsRange;
  status: { configured: boolean; model: string };
  totals: {
    calls: number;
    errors: number;
    /** Distinct signed-in callers. */
    users: number;
    /** Calls without a valid access token. */
    anonymousCalls: number;
    avgDurationMs: number;
  };
  byFeature: Array<{
    feature: AiFeature;
    calls: number;
    errors: number;
    avgDurationMs: number;
  }>;
  daily: Array<{ date: string; calls: number; errors: number }>;
  errorsByCode: Array<{ code: string; count: number }>;
  topUsers: Array<AiUsageUser & { calls: number }>;
  /** The latest calls, whatever the range. */
  recent: Array<{
    id: string;
    createdAt: string;
    feature: AiFeature;
    ok: boolean;
    errorCode: string | null;
    durationMs: number;
    model: string;
    user: AiUsageUser | null;
  }>;
}

/** The last [days] days in [tz], today included. */
export function statsRange(
  days: number,
  tz: string,
  now = new Date(),
): StatsRange & { dates: string[] } {
  // en-CA formats as yyyy-mm-dd.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(todayMs - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
  return { days, tz, from: dates[0], to: today, dates };
}

/**
 * A safe lower bound for `createdAt` filters: the earliest instant that
 * can still be on day [from] in any time zone. Rows before [from] in the
 * report's zone are dropped after bucketing by local day.
 */
function earliestInstant(from: string): Date {
  return new Date(Date.parse(`${from}T00:00:00Z`) - MAX_UTC_OFFSET_MS);
}

/** `yyyy-mm-dd` of a Date field in [tz]. */
const localDay = (field: string, tz: string) => ({
  $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz },
});

/** A date parsed from an ISO string field, or null when it is not one. */
const parsedDate = (field: string) => ({
  $dateFromString: { dateString: field, onError: null, onNull: null },
});

const errorCount = { $sum: { $cond: ['$ok', 0, 1] } };

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(UserDoc.name) private readonly docs: Model<UserDoc>,
    @InjectModel(AiUsage.name) private readonly usage: Model<AiUsage>,
    @InjectModel(WorkoutTemplate.name)
    private readonly templates: Model<WorkoutTemplate>,
    private readonly ai: AiService,
  ) {}

  /**
   * Headline numbers and per-day activity. Sessions are bucketed by the
   * day of their `completedAt` as the app wrote it (the phone's local
   * date); signups and AI calls by their server timestamp in [range.tz].
   */
  async overview(days: number, tz: string): Promise<StatsOverview> {
    const { dates, ...range } = statsRange(days, tz);
    const since = earliestInstant(range.from);
    const [totalUsers, lockedUsers, signups, sessionRows, totalSessions] =
      await Promise.all([
        this.users.countDocuments().exec(),
        this.users.countDocuments({ disabled: true }).exec(),
        this.users
          .aggregate<{ _id: string; count: number }>([
            { $match: { createdAt: { $gte: since } } },
            {
              $group: {
                _id: localDay('$createdAt', tz),
                count: { $sum: 1 },
              },
            },
          ])
          .exec(),
        this.sessionsByDay(range),
        this.docs
          .countDocuments({
            kind: 'sessions',
            deleted: false,
            'data.workoutId': { $ne: FORM_CHECK_WORKOUT_ID },
          })
          .exec(),
      ]);
    const [aiRows, templateCount] = await Promise.all([
      this.usage
        .aggregate<{ _id: string; calls: number; errors: number }>([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: localDay('$createdAt', tz),
              calls: { $sum: 1 },
              errors: errorCount,
            },
          },
        ])
        .exec(),
      this.templates.countDocuments().exec(),
    ]);

    const signupsByDay = new Map(signups.map((row) => [row._id, row.count]));
    const aiByDay = new Map(aiRows.map((row) => [row._id, row]));
    const workouts = new Map<string, number>();
    const formChecks = new Map<string, number>();
    const activeUsers = new Set<string>();
    let minutes = 0;
    for (const row of sessionRows) {
      const target = row._id.formCheck ? formChecks : workouts;
      target.set(row._id.day, row.count);
      if (!row._id.formCheck) minutes += row.minutes;
      for (const id of row.users) activeUsers.add(id.toString());
    }

    const daily = dates.map((date) => ({
      date,
      newUsers: signupsByDay.get(date) ?? 0,
      sessions: workouts.get(date) ?? 0,
      formChecks: formChecks.get(date) ?? 0,
      aiCalls: aiByDay.get(date)?.calls ?? 0,
      aiErrors: aiByDay.get(date)?.errors ?? 0,
    }));
    const total = (key: keyof Omit<DailyActivity, 'date'>) =>
      daily.reduce((sum, day) => sum + day[key], 0);
    return {
      range,
      users: {
        total: totalUsers,
        locked: lockedUsers,
        new: total('newUsers'),
        active: activeUsers.size,
      },
      sessions: {
        total: totalSessions,
        inRange: total('sessions'),
        minutesInRange: minutes,
        formChecksInRange: total('formChecks'),
      },
      ai: { calls: total('aiCalls'), errors: total('aiErrors') },
      templates: templateCount,
      daily,
    };
  }

  /** AI calls in the range by feature, day, error and user, plus the latest. */
  async aiUsage(days: number, tz: string): Promise<AiUsageReport> {
    const { dates, ...range } = statsRange(days, tz);
    type Group = { calls: number; errors: number; avgMs: number | null };
    const [facets] = await this.usage
      .aggregate<{
        totals: Array<
          Group & { anonymous: number; users: Array<Types.ObjectId | null> }
        >;
        byFeature: Array<Group & { _id: AiFeature }>;
        daily: Array<Group & { _id: string }>;
        errors: Array<{ _id: string | null; count: number }>;
        topUsers: Array<{ _id: Types.ObjectId; calls: number }>;
      }>([
        { $match: { createdAt: { $gte: earliestInstant(range.from) } } },
        { $addFields: { day: localDay('$createdAt', tz) } },
        { $match: { day: { $gte: range.from, $lte: range.to } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  calls: { $sum: 1 },
                  errors: errorCount,
                  avgMs: { $avg: '$durationMs' },
                  anonymous: {
                    $sum: { $cond: [{ $eq: ['$userId', null] }, 1, 0] },
                  },
                  users: { $addToSet: '$userId' },
                },
              },
            ],
            byFeature: [
              {
                $group: {
                  _id: '$feature',
                  calls: { $sum: 1 },
                  errors: errorCount,
                  avgMs: { $avg: '$durationMs' },
                },
              },
              { $sort: { calls: -1, _id: 1 } },
            ],
            daily: [
              {
                $group: { _id: '$day', calls: { $sum: 1 }, errors: errorCount },
              },
            ],
            errors: [
              { $match: { ok: false } },
              { $group: { _id: '$errorCode', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
            ],
            topUsers: [
              { $match: { userId: { $ne: null } } },
              { $group: { _id: '$userId', calls: { $sum: 1 } } },
              { $sort: { calls: -1, _id: 1 } },
              { $limit: TOP_AI_USERS },
            ],
          },
        },
      ])
      .exec();
    const recent = await this.usage
      .find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_AI_CALLS)
      .lean()
      .exec();

    const people = await this.lookupUsers([
      ...facets.topUsers.map((row) => row._id),
      ...recent.flatMap((call) => (call.userId ? [call.userId] : [])),
    ]);
    const person = (id: Types.ObjectId): AiUsageUser =>
      people.get(id.toString()) ?? {
        id: id.toString(),
        email: null,
        name: null,
      };

    const totals = facets.totals[0];
    const dailyByDay = new Map(facets.daily.map((row) => [row._id, row]));
    const signedIn = (totals?.users ?? []).filter((id) => id !== null);
    return {
      range,
      status: this.ai.getStatus(),
      totals: {
        calls: totals?.calls ?? 0,
        errors: totals?.errors ?? 0,
        users: signedIn.length,
        anonymousCalls: totals?.anonymous ?? 0,
        avgDurationMs: Math.round(totals?.avgMs ?? 0),
      },
      byFeature: facets.byFeature.map((row) => ({
        feature: row._id,
        calls: row.calls,
        errors: row.errors,
        avgDurationMs: Math.round(row.avgMs ?? 0),
      })),
      daily: dates.map((date) => ({
        date,
        calls: dailyByDay.get(date)?.calls ?? 0,
        errors: dailyByDay.get(date)?.errors ?? 0,
      })),
      errorsByCode: facets.errors.map((row) => ({
        code: row._id ?? 'unknown',
        count: row.count,
      })),
      topUsers: facets.topUsers.map((row) => ({
        ...person(row._id),
        calls: row.calls,
      })),
      recent: recent.map((call) => ({
        id: call._id.toString(),
        createdAt: call.createdAt.toISOString(),
        feature: call.feature,
        ok: call.ok,
        errorCode: call.errorCode,
        durationMs: call.durationMs,
        model: call.model,
        user: call.userId ? person(call.userId) : null,
      })),
    };
  }

  /** Session counts, durations and callers per (local day, form check). */
  private sessionsByDay(range: StatsRange) {
    return this.docs
      .aggregate<{
        _id: { day: string; formCheck: boolean };
        count: number;
        minutes: number;
        users: Types.ObjectId[];
      }>([
        {
          $match: {
            kind: 'sessions',
            deleted: false,
            // ISO strings compare like dates; non-strings never match.
            'data.completedAt': { $gte: range.from },
          },
        },
        {
          $project: {
            userId: 1,
            day: { $substrCP: ['$data.completedAt', 0, 10] },
            formCheck: { $eq: ['$data.workoutId', FORM_CHECK_WORKOUT_ID] },
            ms: {
              $subtract: [
                parsedDate('$data.completedAt'),
                parsedDate('$data.startedAt'),
              ],
            },
          },
        },
        // A phone whose clock runs ahead may report tomorrow.
        { $match: { day: { $lte: range.to } } },
        {
          $group: {
            _id: { day: '$day', formCheck: '$formCheck' },
            count: { $sum: 1 },
            // Whole minutes, at least 1, like the app's durationMinutes.
            minutes: {
              $sum: {
                $max: [
                  1,
                  { $floor: { $divide: [{ $ifNull: ['$ms', 0] }, 60_000] } },
                ],
              },
            },
            users: { $addToSet: '$userId' },
          },
        },
      ])
      .exec();
  }

  private async lookupUsers(
    ids: Types.ObjectId[],
  ): Promise<Map<string, AiUsageUser>> {
    if (ids.length === 0) return new Map();
    const found = await this.users
      .find({ _id: { $in: ids } })
      .select({ email: 1, name: 1 })
      .lean()
      .exec();
    return new Map(
      found.map((user) => [
        user._id.toString(),
        { id: user._id.toString(), email: user.email, name: user.name ?? null },
      ]),
    );
  }
}
