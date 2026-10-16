import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { UserDoc } from '../src/user-docs/schemas/user-doc.schema.js';
import { User } from '../src/users/schemas/user.schema.js';
import { createTestApp, signedInUser } from './helpers.js';

const session = (id: string, day: number) => ({
  id,
  workoutId: 'full-body-foundation',
  workoutName: 'Full Body Foundation',
  startedAt: `2026-10-${day}T08:00:00.000`,
  completedAt: `2026-10-${day}T08:30:00.000`,
  completedSets: 12,
  volumeKg: 480,
  exercises: [{ id: 'squat', name: 'Squat', performedSets: [{ amount: 12 }] }],
});

describe('User docs (e2e)', () => {
  let app: INestApplication<App>;
  let docs: Model<UserDoc>;
  let alice: Awaited<ReturnType<typeof signedInUser>>;
  let bob: Awaited<ReturnType<typeof signedInUser>>;

  beforeAll(async () => {
    app = await createTestApp();
    docs = app.get(getModelToken(UserDoc.name));
    await app.get<Model<User>>(getModelToken(User.name)).deleteMany({});
    alice = await signedInUser(app, 'alice');
    bob = await signedInUser(app, 'bob');
  });

  beforeEach(async () => {
    await docs.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
  });

  it('stores a document and lists it back as the app sent it', async () => {
    const doc = session('s1', 10);
    await alice.put('/api/me/docs/sessions/s1', doc).expect(204);
    const { body } = await alice.get('/api/me/docs/sessions').expect(200);
    expect(body).toEqual([doc]);
  });

  it('lets the URL id win over a different body id', async () => {
    await alice
      .put('/api/me/docs/sessions/s1', { ...session('other', 10) })
      .expect(204);
    const { body } = await alice.get('/api/me/docs/sessions').expect(200);
    expect(body.map((doc: { id: string }) => doc.id)).toEqual(['s1']);
  });

  it('replaces a document on a second PUT', async () => {
    await alice.put('/api/me/docs/sessions/s1', session('s1', 10)).expect(204);
    await alice
      .put('/api/me/docs/sessions/s1', { ...session('s1', 10), volumeKg: 500 })
      .expect(204);
    const { body } = await alice.get('/api/me/docs/sessions').expect(200);
    expect(body).toHaveLength(1);
    expect(body[0].volumeKg).toBe(500);
  });

  it('tombstones deletes, and a later PUT revives the document', async () => {
    await alice.put('/api/me/docs/sessions/s1', session('s1', 10)).expect(204);
    await alice.delete('/api/me/docs/sessions/s1').expect(204);
    let list = await alice.get('/api/me/docs/sessions').expect(200);
    expect(list.body).toEqual([{ id: 's1', deleted: true }]);

    // Deleting something never synced still leaves a tombstone.
    await alice.delete('/api/me/docs/sessions/never-synced').expect(204);

    await alice.put('/api/me/docs/sessions/s1', session('s1', 11)).expect(204);
    list = await alice.get('/api/me/docs/sessions').expect(200);
    expect(list.body).toEqual([
      { id: 'never-synced', deleted: true },
      session('s1', 11),
    ]);
  });

  it('upserts in bulk', async () => {
    const batch = Array.from({ length: 500 }, (_, i) =>
      session(`s${String(i).padStart(3, '0')}`, 10),
    );
    await alice.put('/api/me/docs/sessions', { docs: batch }).expect(204);
    const { body } = await alice.get('/api/me/docs/sessions').expect(200);
    expect(body).toHaveLength(500);
    expect(body[0]).toEqual(batch[0]);
  });

  it('keeps users and kinds apart', async () => {
    await alice.put('/api/me/docs/sessions/s1', session('s1', 10)).expect(204);
    await alice
      .put('/api/me/docs/weights/2026-10-10', {
        date: '2026-10-10',
        weightKg: 70,
      })
      .expect(204);

    expect((await bob.get('/api/me/docs/sessions').expect(200)).body).toEqual(
      [],
    );
    expect((await alice.get('/api/me/docs/weights').expect(200)).body).toEqual([
      { id: '2026-10-10', date: '2026-10-10', weightKg: 70 },
    ]);

    // Bob deleting "s1" only tombstones his own copy.
    await bob.delete('/api/me/docs/sessions/s1').expect(204);
    expect((await alice.get('/api/me/docs/sessions').expect(200)).body).toEqual(
      [session('s1', 10)],
    );
  });

  it('syncs food-log days keyed by date', async () => {
    const day = {
      id: '2026-10-16',
      meals: [
        {
          label: 'Lunch',
          items: [{ name: 'Mi Quang', kcal: 550, proteinG: 26 }],
        },
      ],
    };
    await alice.put('/api/me/docs/foodDays/2026-10-16', day).expect(204);
    await alice.delete('/api/me/docs/foodDays/2026-10-15').expect(204);
    const { body } = await alice.get('/api/me/docs/foodDays').expect(200);
    expect(body).toEqual([{ id: '2026-10-15', deleted: true }, day]);
    expect((await bob.get('/api/me/docs/foodDays').expect(200)).body).toEqual(
      [],
    );
  });

  it('refuses writes once the account is deleted', async () => {
    const ghost = await signedInUser(app, 'ghost');
    await app
      .get<Model<User>>(getModelToken(User.name))
      .deleteOne({ googleSub: 'ghost' });
    await ghost.put('/api/me/docs/sessions/s1', session('s1', 10)).expect(401);
    await ghost.put('/api/me/docs/sessions', { docs: [] }).expect(401);
    await ghost.delete('/api/me/docs/sessions/s1').expect(401);
    expect(await docs.countDocuments()).toBe(0);
  });

  it('accepts bulk bodies over the default 100 kB limit', async () => {
    const big = Array.from({ length: 300 }, (_, i) => ({
      ...session(`big${i}`, 10),
      notes: 'x'.repeat(1000),
    }));
    await alice.put('/api/me/docs/sessions', { docs: big }).expect(204);
  });

  it('requires an access token', async () => {
    await request(app.getHttpServer()).get('/api/me/docs/sessions').expect(401);
    await request(app.getHttpServer())
      .put('/api/me/docs/sessions/s1')
      .send(session('s1', 10))
      .expect(401);
  });

  it.each([
    ['unknown kind', 'get', '/api/me/docs/profiles', undefined],
    ['bad id', 'put', '/api/me/docs/sessions/a b', session('x', 10)],
    ['array body', 'put', '/api/me/docs/sessions/s1', [1, 2]],
    ['$ field', 'put', '/api/me/docs/sessions/s1', { $where: 'x' }],
    ['nested $ field', 'put', '/api/me/docs/sessions/s1', { a: [{ $gt: 1 }] }],
    ['dotted field', 'put', '/api/me/docs/sessions/s1', { 'a.b': 1 }],
    ['NUL in field', 'put', '/api/me/docs/sessions/s1', { 'a\u0000b': 1 }],
    ['bulk without docs', 'put', '/api/me/docs/sessions', { items: [] }],
    ['bulk doc without id', 'put', '/api/me/docs/sessions', { docs: [{}] }],
    [
      'bulk duplicate ids',
      'put',
      '/api/me/docs/sessions',
      { docs: [{ id: 'a' }, { id: 'a' }] },
    ],
    [
      'bulk over 500',
      'put',
      '/api/me/docs/sessions',
      { docs: Array.from({ length: 501 }, (_, i) => ({ id: `d${i}` })) },
    ],
  ])('rejects %s with 400', async (_, method, path, body) => {
    const res =
      method === 'get' ? alice.get(path) : alice.put(path, body as object);
    await res.expect(400);
    expect(await docs.countDocuments()).toBe(0);
  });
});
