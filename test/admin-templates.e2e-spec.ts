import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Admin } from '../src/admin/accounts/admin.schema.js';
import { WorkoutTemplate } from '../src/templates/schemas/workout-template.schema.js';
import { WORKOUT_TEMPLATES } from '../src/templates/seed/workout-templates.seed.js';
import { TemplatesService } from '../src/templates/templates.service.js';
import { createTestApp, signedInAdmin, signedInUser } from './helpers.js';

type Admin_ = Awaited<ReturnType<typeof signedInAdmin>>;

const plan = {
  id: 'quick-core',
  name: 'Quick Core',
  durationMinutes: 15,
  level: 'Beginner',
  category: 'Strength',
  description: 'Short core circuit.',
  exercises: [
    {
      id: 'plank',
      name: 'Plank',
      muscleGroup: 'Core',
      sets: 3,
      reps: 0,
      durationSeconds: 40,
      restSeconds: 30,
      weightKg: 0,
    },
    {
      id: 'crunch',
      name: 'Crunch',
      muscleGroup: 'Core',
      sets: 3,
      reps: 15,
      durationSeconds: 0,
      restSeconds: 30,
      weightKg: 0,
    },
  ],
};

describe('Admin templates (e2e)', () => {
  let app: INestApplication<App>;
  let model: Model<WorkoutTemplate>;
  let templates: TemplatesService;
  let admin: Admin_;

  beforeAll(async () => {
    app = await createTestApp();
    model = app.get(getModelToken(WorkoutTemplate.name));
    templates = app.get(TemplatesService);
    await app.get<Model<Admin>>(getModelToken(Admin.name)).deleteMany({});
    admin = await signedInAdmin(app);
  });

  beforeEach(async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
  });

  afterAll(async () => {
    await app?.close();
  });

  const publicIds = async () =>
    (
      await request(app.getHttpServer()).get('/api/templates').expect(200)
    ).body.map((item: { id: string }) => item.id);

  it('lists every template in order, with updatedAt', async () => {
    const { body } = await admin.get('/api/admin/templates').expect(200);
    expect(body.map((item: { id: string }) => item.id)).toEqual(
      WORKOUT_TEMPLATES.map((item) => item.id),
    );
    expect(Date.parse(body[0].updatedAt)).not.toBeNaN();
    const one = await admin
      .get(`/api/admin/templates/${WORKOUT_TEMPLATES[1].id}`)
      .expect(200);
    expect(one.body).toMatchObject(WORKOUT_TEMPLATES[1]);
  });

  it('creates a template at the end, visible in the public list', async () => {
    const { body } = await admin.post('/api/admin/templates', plan).expect(201);
    expect(body).toMatchObject(plan);
    expect(await publicIds()).toEqual([
      ...WORKOUT_TEMPLATES.map((item) => item.id),
      plan.id,
    ]);
    const res = await request(app.getHttpServer()).get('/api/templates');
    expect(res.body.at(-1)).toEqual(plan);
  });

  it('refuses a taken id with 409', async () => {
    const res = await admin
      .post('/api/admin/templates', { ...plan, id: WORKOUT_TEMPLATES[0].id })
      .expect(409);
    expect(res.body.message).toContain('already exists');
  });

  it.each([
    ['an id the app reserves for custom plans', { id: 'custom-123' }],
    ['the form-check id', { id: 'form-check' }],
    ['an id with capitals', { id: 'Quick-Core' }],
    ['an unknown level', { level: 'Expert' }],
    ['an unknown category', { category: 'Yoga' }],
    ['a blank name', { name: '   ' }],
    ['a fractional duration', { durationMinutes: 12.5 }],
    ['no exercises', { exercises: [] }],
    ['an unknown field', { extra: true }],
    [
      'an exercise with both reps and a duration',
      { exercises: [{ ...plan.exercises[1], durationSeconds: 30 }] },
    ],
    [
      'an exercise with neither reps nor a duration',
      { exercises: [{ ...plan.exercises[1], reps: 0 }] },
    ],
    [
      'duplicate exercise ids',
      { exercises: [plan.exercises[1], plan.exercises[1]] },
    ],
    [
      'an exercise with an unknown field',
      { exercises: [{ ...plan.exercises[1], tempo: '3-1-1' }] },
    ],
  ])('rejects %s with 400', async (_, change) => {
    await admin
      .post('/api/admin/templates', { ...plan, ...change })
      .expect(400);
    expect(
      await model.exists({ _id: (change as { id?: string }).id ?? plan.id }),
    ).toBeNull();
  });

  it('trims text fields', async () => {
    const { body } = await admin
      .post('/api/admin/templates', { ...plan, name: '  Quick Core  ' })
      .expect(201);
    expect(body.name).toBe('Quick Core');
  });

  it('updates everything but the id and the position', async () => {
    const target = WORKOUT_TEMPLATES[0];
    const { id, ...fields } = plan;
    void id;
    const { body } = await admin
      .put(`/api/admin/templates/${target.id}`, {
        ...fields,
        name: 'Renamed',
      })
      .expect(200);
    expect(body).toMatchObject({ ...fields, id: target.id, name: 'Renamed' });
    expect((await publicIds())[0]).toBe(target.id);
    await admin
      .put(`/api/admin/templates/${target.id}`, { ...fields, id: 'other' })
      .expect(400);
  });

  it('answers 404 for unknown ids', async () => {
    const { id, ...fields } = plan;
    await admin.get(`/api/admin/templates/${id}`).expect(404);
    await admin.put(`/api/admin/templates/${id}`, fields).expect(404);
    await admin.delete(`/api/admin/templates/${id}`).expect(404);
  });

  it('deletes a template', async () => {
    const target = WORKOUT_TEMPLATES[2].id;
    await admin.delete(`/api/admin/templates/${target}`).expect(204);
    expect(await publicIds()).not.toContain(target);
  });

  it('reorders the templates', async () => {
    const reversed = WORKOUT_TEMPLATES.map((item) => item.id).reverse();
    const { body } = await admin
      .post('/api/admin/templates/reorder', { ids: reversed })
      .expect(200);
    expect(body.map((item: { id: string }) => item.id)).toEqual(reversed);
    expect(await publicIds()).toEqual(reversed);
  });

  it('refuses a reorder that is not a permutation of the templates', async () => {
    const ids = WORKOUT_TEMPLATES.map((item) => item.id);
    for (const bad of [
      ids.slice(1),
      [...ids, 'unknown'],
      [ids[0], ...ids.slice(0, -1)],
      [...ids.slice(1), 'unknown'],
    ]) {
      await admin
        .post('/api/admin/templates/reorder', { ids: bad })
        .expect(400);
    }
    expect(await publicIds()).toEqual(ids);
  });

  it('is closed to app users and anonymous callers', async () => {
    const user = await signedInUser(app, 'admin-templates-user');
    await user.get('/api/admin/templates').expect(401);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .send(plan)
      .expect(401);
    expect(await model.exists({ _id: plan.id })).toBeNull();
  });

  describe('seeding', () => {
    it('adds only missing built-ins and keeps admin edits', async () => {
      const [first, second] = WORKOUT_TEMPLATES;
      await admin.post('/api/admin/templates', plan).expect(201);
      const { id, ...fields } = first;
      void id;
      await admin
        .put(`/api/admin/templates/${first.id}`, { ...fields, name: 'Edited' })
        .expect(200);
      await admin.delete(`/api/admin/templates/${second.id}`).expect(204);

      expect(await templates.insertMissing(WORKOUT_TEMPLATES)).toEqual({
        inserted: 1,
      });
      const ids = await publicIds();
      expect(ids).toContain(plan.id);
      expect(ids).toContain(second.id);
      const edited = await admin.get(`/api/admin/templates/${first.id}`);
      expect(edited.body.name).toBe('Edited');
    });

    it('is a no-op when nothing is missing', async () => {
      expect(await templates.insertMissing(WORKOUT_TEMPLATES)).toEqual({
        inserted: 0,
      });
    });
  });
});
