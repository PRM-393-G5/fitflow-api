import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { OAuth2Client } from 'google-auth-library';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RefreshToken } from '../src/auth/tokens/refresh-token.schema.js';
import { UserDoc } from '../src/user-docs/schemas/user-doc.schema.js';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp } from './helpers.js';

/**
 * Syntactically valid JWTs the fake Google client trusts: `sub` and `iat`
 * (seconds) come from the payload; `invalid` makes verification fail.
 */
const tokenFor = (
  sub: string,
  { iat = Math.floor(Date.now() / 1000), invalid = false } = {},
) =>
  `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ sub, iat, invalid })).toString('base64url')}.c2ln`;

describe('Meta and account (e2e)', () => {
  let app: INestApplication<App>;
  let users: Model<User>;
  let docs: Model<UserDoc>;
  let refreshTokens: Model<RefreshToken>;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(OAuth2Client).useValue({
        verifyIdToken: ({ idToken }: { idToken: string }) => {
          const { sub, iat, invalid } = JSON.parse(
            Buffer.from(idToken.split('.')[1], 'base64url').toString(),
          ) as { sub: string; iat: number; invalid: boolean };
          if (invalid) return Promise.reject(new Error('Token used too late'));
          return Promise.resolve({
            getPayload: () => ({
              sub,
              iat,
              email: `${sub}@example.com`,
              email_verified: true,
            }),
          });
        },
      }),
    );
    users = app.get(getModelToken(User.name));
    docs = app.get(getModelToken(UserDoc.name));
    refreshTokens = app.get(getModelToken(RefreshToken.name));
  });

  beforeEach(async () => {
    await users.deleteMany({});
    await docs.deleteMany({});
    await refreshTokens.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Signs in through the real endpoint and returns the session. */
  async function signIn(sub: string) {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ idToken: tokenFor(sub) })
      .expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    const server = app.getHttpServer();
    return {
      ...body,
      getMeta: () => request(server).get('/api/me/meta').set(auth),
      putMeta: (payload: object) =>
        request(server).put('/api/me/meta').set(auth).send(payload),
      deleteAccount: (idToken: string) =>
        request(server).delete('/api/me').set(auth).send({ idToken }),
      putDoc: (id: string) =>
        request(server)
          .put(`/api/me/docs/sessions/${id}`)
          .set(auth)
          .send({ volumeKg: 1 }),
    };
  }

  const meta = (goal: string) => ({
    profile: { heightCm: 175, age: 30, isMale: true, activityLevel: 1.55 },
    schedule: { '1': 'full-body-foundation' },
    onboarding: { done: true, goal, level: 'Beginner' },
    weeklyGoal: 3,
  });

  describe('meta', () => {
    it('is empty for a new account', async () => {
      const user = await signIn('meta-new');
      const { body } = await user.getMeta().expect(200);
      expect(body).toEqual({ updatedAt: 0, meta: null });
    });

    it('applies newer writes and refuses stale ones', async () => {
      const user = await signIn('meta-lww');
      const first = await user
        .putMeta({ updatedAt: 2000, meta: meta('Strength') })
        .expect(200);
      expect(first.body).toEqual({
        applied: true,
        updatedAt: 2000,
        meta: meta('Strength'),
      });

      // An older device pushes later: not applied, server copy returned.
      const stale = await user
        .putMeta({ updatedAt: 1000, meta: meta('Cardio') })
        .expect(200);
      expect(stale.body).toEqual({
        applied: false,
        updatedAt: 2000,
        meta: meta('Strength'),
      });
      // Equal timestamps do not overwrite either.
      expect(
        (await user.putMeta({ updatedAt: 2000, meta: meta('Cardio') })).body
          .applied,
      ).toBe(false);

      expect((await user.getMeta().expect(200)).body).toEqual({
        updatedAt: 2000,
        meta: meta('Strength'),
      });
    });

    it('applies exactly one of many racing writes with the same timestamp', async () => {
      const user = await signIn('meta-race');
      const results = await Promise.all(
        ['A', 'B', 'C', 'D'].map((goal) =>
          user.putMeta({ updatedAt: 5000, meta: meta(goal) }),
        ),
      );
      expect(results.filter((res) => res.body.applied)).toHaveLength(1);
    });

    it.each([
      [{ meta: {} }],
      [{ updatedAt: 0, meta: {} }],
      [{ updatedAt: 1.5, meta: {} }],
      [{ updatedAt: 1, meta: [] }],
      [{ updatedAt: 1, meta: { $set: 1 } }],
      [{ updatedAt: 1, meta: {}, extra: true }],
    ])('rejects %j with 400', async (payload) => {
      const user = await signIn('meta-bad');
      await user.putMeta(payload).expect(400);
    });

    it('rejects timestamps too far in the future', async () => {
      const user = await signIn('meta-future');
      await user
        .putMeta({ updatedAt: Date.now() + 60 * 60 * 1000, meta: {} })
        .expect(400);
      await user.putMeta({ updatedAt: Date.now(), meta: {} }).expect(200);
    });

    it('stores string values that look like field paths verbatim', async () => {
      const user = await signIn('meta-literal');
      const tricky = { note: '$metaUpdatedAt', nested: { a: '$$ROOT' } };
      await user.putMeta({ updatedAt: 1000, meta: tricky }).expect(200);
      expect((await user.getMeta()).body.meta).toEqual(tricky);
    });

    it('requires an access token', async () => {
      await request(app.getHttpServer()).get('/api/me/meta').expect(401);
    });
  });

  describe('DELETE /api/me', () => {
    it('removes the user, their documents and every session', async () => {
      const user = await signIn('leaver');
      const otherDevice = await signIn('leaver');
      const stayer = await signIn('stayer');
      await user.putDoc('s1').expect(204);
      await stayer.putDoc('s1').expect(204);

      await user.deleteAccount(tokenFor('leaver')).expect(204);

      expect(await users.countDocuments({ googleSub: 'leaver' })).toBe(0);
      expect(await docs.countDocuments()).toBe(1);
      for (const session of [user, otherDevice]) {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: session.refreshToken })
          .expect(401);
      }
      await user.getMeta().expect(401);
      await stayer.getMeta().expect(200);
    });

    it('refuses a Google token of another account', async () => {
      const user = await signIn('victim');
      await user.deleteAccount(tokenFor('attacker')).expect(403);
      expect(await users.countDocuments({ googleSub: 'victim' })).toBe(1);
    });

    it('answers 403 (not 401) when Google rejects the token', async () => {
      const user = await signIn('reauth-invalid');
      await user
        .deleteAccount(tokenFor('reauth-invalid', { invalid: true }))
        .expect(403);
      expect(await users.countDocuments({ googleSub: 'reauth-invalid' })).toBe(
        1,
      );
    });

    it('requires a recent Google sign-in', async () => {
      const user = await signIn('reauth-old');
      const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
      await user
        .deleteAccount(tokenFor('reauth-old', { iat: tenMinutesAgo }))
        .expect(403);
      expect(await users.countDocuments({ googleSub: 'reauth-old' })).toBe(1);
    });

    it("refuses other devices' writes once deletion has begun", async () => {
      const user = await signIn('racer');
      const otherDevice = await signIn('racer');
      const [deleted, write] = await Promise.all([
        user.deleteAccount(tokenFor('racer')),
        otherDevice.putDoc('late'),
      ]);
      expect(deleted.status).toBe(204);
      // Either the write landed before the wipe or it was refused; in
      // both cases nothing of the account remains.
      expect([204, 401]).toContain(write.status);
      expect(await docs.countDocuments()).toBe(0);
    });

    it('requires the Google token', async () => {
      const user = await signIn('no-token');
      await request(app.getHttpServer())
        .delete('/api/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({})
        .expect(400);
    });
  });
});
