import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { App } from 'supertest/types.js';
import { AiUsage } from '../src/ai/schemas/ai-usage.schema.js';
import { TemplatesService } from '../src/templates/templates.service.js';
import { WORKOUT_TEMPLATES } from '../src/templates/seed/workout-templates.seed.js';
import { UserDoc } from '../src/user-docs/schemas/user-doc.schema.js';
import { UserDocsService } from '../src/user-docs/user-docs.service.js';
import { User } from '../src/users/schemas/user.schema.js';
import { UsersService } from '../src/users/users.service.js';
import { createTestApp, signedInAdmin, signedInUser } from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
/** The app's offset-less local timestamp, here in UTC. */
const appTime = (date: Date) => date.toISOString().slice(0, 23);

const session = (id: string, end: Date, ms: number, workoutId = 'plan') => ({
  id,
  workoutId,
  workoutName: 'Plan',
  startedAt: appTime(new Date(end.getTime() - ms)),
  completedAt: appTime(end),
  completedSets: 10,
  volumeKg: 100,
  exercises: [],
});

describe('Admin stats (e2e)', () => {
  let app: INestApplication<App>;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let usersModel: Model<User>;
  let usage: Model<AiUsage>;
  let athleteId: string;

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signedInAdmin(app);
    usersModel = app.get(getModelToken(User.name));
    usage = app.get(getModelToken(AiUsage.name));
    await usersModel.deleteMany({});
    await app.get<Model<UserDoc>>(getModelToken(UserDoc.name)).deleteMany({});
    await usage.deleteMany({});
    await app.get(TemplatesService).replaceAll(WORKOUT_TEMPLATES);

    const users = app.get(UsersService);
    const docs = app.get(UserDocsService);
    const athlete = await users.upsertFromGoogle({
      sub: 's-athlete',
      email: 'athlete@example.com',
      name: 'Athlete',
    });
    athleteId = athlete.id as string;
    const newcomer = await users.upsertFromGoogle({
      sub: 's-new',
      email: 'new@example.com',
    });
    const locked = await users.upsertFromGoogle({
      sub: 's-locked',
      email: 'locked@example.com',
    });
    // Bypass timestamps to place signups in time.
    await usersModel.collection.updateOne(
      { _id: athlete._id },
      { $set: { createdAt: daysAgo(40) } },
    );
    await usersModel.collection.updateOne(
      { _id: locked._id },
      { $set: { createdAt: daysAgo(2), disabled: true } },
    );
    void newcomer;

    const now = new Date();
    await docs.upsertMany(athleteId, 'sessions', [
      session('today', now, 30 * 60_000),
      session('two-days', daysAgo(2), 10 * 60_000 + 40_000),
      session('form', now, 20_000, 'form-check'),
      session('old', daysAgo(40), 60 * 60_000),
      session('gone', now, 60 * 60_000),
    ]);
    await docs.tombstone(athleteId, 'sessions', 'gone');

    await usage.insertMany([
      {
        userId: athlete._id,
        feature: 'meal-plan',
        model: 'gpt-6-luna',
        ok: true,
        errorCode: null,
        durationMs: 1000,
        createdAt: new Date(now.getTime() - 3000),
      },
      {
        userId: athlete._id,
        feature: 'food-photo',
        model: 'gpt-6-luna',
        ok: true,
        errorCode: null,
        durationMs: 3000,
        createdAt: new Date(now.getTime() - 2000),
      },
      {
        userId: null,
        feature: 'meal-plan',
        model: 'gpt-6-luna',
        ok: false,
        errorCode: 'timeout',
        durationMs: 90000,
        createdAt: new Date(now.getTime() - 1000),
      },
      {
        userId: athlete._id,
        feature: 'workout-plan',
        model: 'gpt-6-luna',
        ok: true,
        errorCode: null,
        durationMs: 5000,
        createdAt: daysAgo(40),
      },
    ]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('summarises users, workouts, AI calls and templates', async () => {
    const { body } = await admin
      .get('/api/admin/stats/overview?days=30&tz=UTC')
      .expect(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(body.range).toEqual({
      days: 30,
      tz: 'UTC',
      from: new Date(Date.now() - 29 * DAY_MS).toISOString().slice(0, 10),
      to: today,
    });
    expect(body.users).toEqual({ total: 3, locked: 1, new: 2, active: 1 });
    expect(body.sessions).toEqual({
      total: 3,
      inRange: 2,
      // 30 + 10 (10 min 40 s, whole minutes like the app).
      minutesInRange: 40,
      formChecksInRange: 1,
    });
    expect(body.ai).toEqual({ calls: 3, errors: 1 });
    expect(body.templates).toBe(WORKOUT_TEMPLATES.length);
    expect(body.daily).toHaveLength(30);
    expect(body.daily.at(-1)).toEqual({
      date: today,
      newUsers: 1,
      sessions: 1,
      formChecks: 1,
      aiCalls: 3,
      aiErrors: 1,
    });
  });

  it('defaults to 30 days in UTC', async () => {
    const { body } = await admin.get('/api/admin/stats/overview').expect(200);
    expect(body.range).toMatchObject({ days: 30, tz: 'UTC' });
  });

  it('reports AI usage by feature, error and user', async () => {
    const { body } = await admin
      .get('/api/admin/stats/ai?days=7&tz=Asia/Ho_Chi_Minh')
      .expect(200);
    // `configured` depends on OPENAI_API_KEY in the environment.
    expect(body.status).toEqual({
      configured: expect.any(Boolean),
      model: 'gpt-6-luna',
    });
    expect(body.totals).toEqual({
      calls: 3,
      errors: 1,
      users: 1,
      anonymousCalls: 1,
      avgDurationMs: Math.round((1000 + 3000 + 90000) / 3),
    });
    expect(body.byFeature).toEqual([
      { feature: 'meal-plan', calls: 2, errors: 1, avgDurationMs: 45500 },
      { feature: 'food-photo', calls: 1, errors: 0, avgDurationMs: 3000 },
    ]);
    expect(body.daily).toHaveLength(7);
    expect(
      body.daily.reduce(
        (sum: number, day: { calls: number }) => sum + day.calls,
        0,
      ),
    ).toBe(3);
    expect(body.errorsByCode).toEqual([{ code: 'timeout', count: 1 }]);
    expect(body.topUsers).toEqual([
      {
        id: athleteId,
        email: 'athlete@example.com',
        name: 'Athlete',
        calls: 2,
      },
    ]);
    // The latest calls whatever the range, newest first.
    expect(
      body.recent.map((call: { feature: string }) => call.feature),
    ).toEqual(['meal-plan', 'food-photo', 'meal-plan', 'workout-plan']);
    expect(body.recent[0]).toMatchObject({
      ok: false,
      errorCode: 'timeout',
      user: null,
    });
    expect(body.recent[1].user).toEqual({
      id: athleteId,
      email: 'athlete@example.com',
      name: 'Athlete',
    });
  });

  it.each(['Asia/Saigon', 'asia/ho_chi_minh', 'America/Los_Angeles'])(
    'accepts the zone name %s',
    async (tz) => {
      const { body } = await admin
        .get(`/api/admin/stats/overview?tz=${encodeURIComponent(tz)}`)
        .expect(200);
      expect(body.users.total).toBe(3);
      await admin
        .get(`/api/admin/stats/ai?tz=${encodeURIComponent(tz)}`)
        .expect(200);
    },
  );

  it.each(['days=0', 'days=91', 'days=abc', 'tz=Mars/Base', 'extra=1'])(
    'rejects ?%s with 400',
    async (query) => {
      await admin.get(`/api/admin/stats/overview?${query}`).expect(400);
      await admin.get(`/api/admin/stats/ai?${query}`).expect(400);
    },
  );

  it('is closed to app users', async () => {
    const user = await signedInUser(app, 's-curious');
    await user.get('/api/admin/stats/overview').expect(401);
    await user.get('/api/admin/stats/ai').expect(401);
  });
});
