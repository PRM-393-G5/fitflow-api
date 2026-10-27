import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { OAuth2Client } from 'google-auth-library';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RefreshToken } from '../src/auth/tokens/refresh-token.schema.js';
import { TokensService } from '../src/auth/tokens/tokens.service.js';
import { UserDoc } from '../src/user-docs/schemas/user-doc.schema.js';
import { UserDocsService } from '../src/user-docs/user-docs.service.js';
import { User } from '../src/users/schemas/user.schema.js';
import { UsersService } from '../src/users/users.service.js';
import { createTestApp, signedInAdmin, signedInUser } from './helpers.js';

/** A syntactically valid JWT the fake Google client accepts. */
const GOOGLE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJsb2NrIn0.c2ln';

const session = (
  id: string,
  completedAt: string,
  minutes: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  workoutId: 'full-body-foundation',
  workoutName: 'Full Body Foundation',
  startedAt: new Date(Date.parse(completedAt) - minutes * 60_000).toISOString(),
  completedAt,
  completedSets: 12,
  volumeKg: 1000,
  exercises: [],
  ...extra,
});

describe('Admin users (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersService;
  let docs: UserDocsService;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(OAuth2Client).useValue({
        verifyIdToken: ({ idToken }: { idToken: string }) =>
          idToken === GOOGLE_TOKEN
            ? Promise.resolve({
                getPayload: () => ({
                  sub: 'google-locked',
                  email: 'locked@example.com',
                  email_verified: true,
                }),
              })
            : Promise.reject(new Error('Wrong token')),
      }),
    );
    users = app.get(UsersService);
    docs = app.get(UserDocsService);
    admin = await signedInAdmin(app);
  });

  beforeEach(async () => {
    for (const name of [User.name, UserDoc.name, RefreshToken.name]) {
      await app.get<Model<unknown>>(getModelToken(name)).deleteMany({});
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const createUser = async (sub: string, email: string, name?: string) => {
    const user = await users.upsertFromGoogle({ sub, email, name });
    return user.id as string;
  };

  describe('list', () => {
    it('lists newest first with finished-workout counts', async () => {
      const older = await createUser('g-1', 'older@example.com', 'Older');
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await createUser('g-2', 'newer@example.com', 'Newer');
      await docs.upsertMany(older, 'sessions', [
        session('s1', '2026-10-01T10:00:00.000Z', 30),
        session('s2', '2026-10-02T10:00:00.000Z', 30),
        session('f1', '2026-10-03T10:00:00.000Z', 1, {
          workoutId: 'form-check',
        }),
        session('s3', '2026-10-04T10:00:00.000Z', 30),
      ]);
      await docs.tombstone(older, 'sessions', 's3');

      const { body } = await admin.get('/api/admin/users').expect(200);
      expect(body).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([
        newer,
        older,
      ]);
      expect(body.items[1]).toMatchObject({
        email: 'older@example.com',
        name: 'Older',
        disabled: false,
        sessionCount: 2,
      });
      expect(Date.parse(body.items[1].lastSignInAt)).not.toBeNaN();
    });

    it('searches email and name case-insensitively, literally', async () => {
      await createUser('g-1', 'alice@example.com', 'Alice Nguyen');
      await createUser('g-2', 'bob@example.com', 'Bob Tran');
      await createUser('g-3', 'axb@example.com', 'Carol');
      const search = async (term: string) =>
        (
          await admin
            .get(`/api/admin/users?search=${encodeURIComponent(term)}`)
            .expect(200)
        ).body.items.map((item: { email: string }) => item.email);

      expect(await search('ALICE')).toEqual(['alice@example.com']);
      expect(await search('tran')).toEqual(['bob@example.com']);
      expect(await search('a.b')).toEqual([]);
      expect(await search('(')).toEqual([]);
    });

    it('filters by status and paginates', async () => {
      const first = await createUser('g-1', 'one@example.com');
      await createUser('g-2', 'two@example.com');
      await createUser('g-3', 'three@example.com');
      await admin.patch(`/api/admin/users/${first}`, { disabled: true });

      const locked = await admin.get('/api/admin/users?status=locked');
      expect(locked.body.items.map((item: { id: string }) => item.id)).toEqual([
        first,
      ]);
      const active = await admin.get('/api/admin/users?status=active');
      expect(active.body.total).toBe(2);

      const page2 = await admin.get('/api/admin/users?page=2&limit=2');
      expect(page2.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(page2.body.items).toHaveLength(1);
    });

    it.each(['limit=0', 'limit=101', 'page=0', 'status=banned', 'sort=email'])(
      'rejects ?%s with 400',
      async (query) => {
        await admin.get(`/api/admin/users?${query}`).expect(400);
      },
    );
  });

  describe('detail', () => {
    it('shows profile, counts, totals and recent sessions', async () => {
      const id = await createUser('g-1', 'athlete@example.com', 'Athlete');
      await users.putMeta(id, Date.now(), {
        profile: { heightCm: 175, age: 30, isMale: true, activityLevel: 1.55 },
        onboarding: { done: true, goal: 'Strength', level: 'Intermediate' },
        weeklyGoal: 4,
        schedule: {},
      });
      await docs.upsertMany(id, 'sessions', [
        session('s1', '2026-10-01T10:00:00.000Z', 30),
        session('s2', '2026-10-05T10:00:00.000Z', 45, { volumeKg: 500.25 }),
        session('f1', '2026-10-03T10:00:00.000Z', 1, {
          workoutId: 'form-check',
          workoutName: 'Form check',
        }),
      ]);
      await docs.upsertMany(id, 'workouts', [{ id: 'custom-1', name: 'Mine' }]);
      await docs.upsertMany(id, 'weights', [
        { id: '2026-10-01', date: '2026-10-01T00:00:00.000Z', weightKg: 70 },
        { id: '2026-10-08', date: '2026-10-08T00:00:00.000Z', weightKg: 69.5 },
      ]);
      await docs.upsertMany(id, 'meals', [
        { id: '2026-10-08:1', name: 'Rice', kcal: 400 },
      ]);

      const { body } = await admin.get(`/api/admin/users/${id}`).expect(200);
      expect(body).toMatchObject({
        id,
        email: 'athlete@example.com',
        sessionCount: 2,
        profile: {
          goal: 'Strength',
          level: 'Intermediate',
          weeklyGoal: 4,
          heightCm: 175,
          age: 30,
          isMale: true,
          activityLevel: 1.55,
        },
        counts: {
          sessions: 2,
          formChecks: 1,
          workouts: 1,
          weights: 2,
          meals: 1,
        },
        totals: { minutes: 75, volumeKg: 1500.3 },
        latestWeightKg: 69.5,
      });
      expect(Date.parse(body.lastSyncAt)).not.toBeNaN();
      expect(
        body.recentSessions.map((item: { id: string }) => item.id),
      ).toEqual(['s2', 'f1', 's1']);
      expect(body.recentSessions[1]).toMatchObject({
        formCheck: true,
        workoutName: 'Form check',
      });
    });

    it('has no profile before the app synced one', async () => {
      const id = await createUser('g-1', 'new@example.com');
      const { body } = await admin.get(`/api/admin/users/${id}`).expect(200);
      expect(body).toMatchObject({
        profile: null,
        latestWeightKg: null,
        lastSyncAt: null,
        recentSessions: [],
      });
    });

    it('answers 404 for unknown and malformed ids', async () => {
      await admin.get('/api/admin/users/64b000000000000000000000').expect(404);
      await admin.get('/api/admin/users/not-an-id').expect(404);
    });
  });

  describe('locking', () => {
    const signIn = () =>
      request(app.getHttpServer())
        .post('/api/auth/google')
        .send({ idToken: GOOGLE_TOKEN });

    it('cuts a locked account off everywhere, and unlocking restores sign-in', async () => {
      const { body: session_ } = await signIn().expect(200);
      const id = session_.user.id as string;
      const auth = { Authorization: `Bearer ${session_.accessToken}` };
      const server = app.getHttpServer();

      const { body } = await admin
        .patch(`/api/admin/users/${id}`, { disabled: true })
        .expect(200);
      expect(body).toMatchObject({ id, disabled: true });
      expect(
        await app
          .get<Model<RefreshToken>>(getModelToken(RefreshToken.name))
          .countDocuments(),
      ).toBe(0);

      for (const call of [
        () => request(server).get('/api/me').set(auth),
        () => request(server).get('/api/me/meta').set(auth),
        () => request(server).get('/api/me/docs/sessions').set(auth),
        () =>
          request(server)
            .put('/api/me/docs/sessions/s1')
            .set(auth)
            .send(session('s1', '2026-10-01T10:00:00.000Z', 30)),
      ]) {
        // One at a time: supertest starts the server for each request.
        const res = await call().expect(401);
        expect(res.body.message).toBe('Account is locked');
      }
      await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: session_.refreshToken })
        .expect(401);
      const refused = await signIn().expect(403);
      expect(refused.body.message).toBe('Account is locked');

      await admin
        .patch(`/api/admin/users/${id}`, { disabled: false })
        .expect(200);
      await signIn().expect(200);
    });

    it('refuses a locked account a new session even with a fresh refresh token', async () => {
      const id = await createUser('g-1', 'one@example.com');
      await admin.patch(`/api/admin/users/${id}`, { disabled: true });
      // A token issued after locking (e.g. a race) still cannot refresh.
      const { refreshToken } = await app.get(TokensService).issue(id);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('validates the body and the id', async () => {
      const id = await createUser('g-1', 'one@example.com');
      await admin
        .patch(`/api/admin/users/${id}`, { disabled: 'yes' })
        .expect(400);
      await admin.patch(`/api/admin/users/${id}`, {}).expect(400);
      await admin
        .patch('/api/admin/users/64b000000000000000000000', { disabled: true })
        .expect(404);
    });
  });

  it('deletes an account with all its data', async () => {
    const user = await signedInUser(app, 'g-delete');
    await docs.upsertMany(user.userId, 'sessions', [
      session('s1', '2026-10-01T10:00:00.000Z', 30),
    ]);
    await admin.delete(`/api/admin/users/${user.userId}`).expect(204);

    expect(await users.findById(user.userId)).toBeNull();
    expect(await docs.list(user.userId, 'sessions')).toEqual([]);
    await user.get('/api/me').expect(401);
    await admin.delete(`/api/admin/users/${user.userId}`).expect(404);
  });

  it('is closed to app users', async () => {
    const user = await signedInUser(app, 'g-curious');
    await user.get('/api/admin/users').expect(401);
    await user.delete(`/api/admin/users/${user.userId}`).expect(401);
    expect(await users.findById(user.userId)).not.toBeNull();
  });
});
