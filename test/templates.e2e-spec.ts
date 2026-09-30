import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { WorkoutTemplate } from '../src/templates/schemas/workout-template.schema.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { WORKOUT_TEMPLATES } from '../src/templates/seed/workout-templates.seed.js';
import { TemplatesService } from '../src/templates/templates.service.js';

describe('Templates (e2e)', () => {
  let app: INestApplication<App>;
  let templates: TemplatesService;
  let model: Model<WorkoutTemplate>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    templates = moduleRef.get(TemplatesService);
    model = moduleRef.get(getModelToken(WorkoutTemplate.name));
  });

  afterAll(async () => {
    await app?.close();
  });

  const list = () =>
    request(app.getHttpServer()).get('/api/templates').expect(200);

  it('serves the seeded templates publicly, in seed order and app shape', async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
    const { body } = await list();
    expect(body).toEqual(WORKOUT_TEMPLATES);
  });

  it('is idempotent and keeps createdAt on re-seeds', async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
    const before = await model.find().sort({ _id: 1 }).lean();
    const again = await templates.replaceAll(WORKOUT_TEMPLATES);
    expect(again.deleted).toBe(0);

    const after = await model.find().sort({ _id: 1 }).lean();
    expect(after.map((doc) => doc.createdAt)).toEqual(
      before.map((doc) => doc.createdAt),
    );
    expect((await list()).body).toEqual(WORKOUT_TEMPLATES);
  });

  it('marks the list cacheable', async () => {
    const res = await list();
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('removes templates dropped from the seed', async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
    const [first, ...rest] = WORKOUT_TEMPLATES;
    const result = await templates.replaceAll(rest.reverse());
    expect(result.deleted).toBe(1);

    const { body } = await list();
    expect(body.map((item: { id: string }) => item.id)).toEqual(
      rest.map((item) => item.id),
    );
    expect(body.map((item: { id: string }) => item.id)).not.toContain(first.id);
  });

  it('rejects duplicate ids without touching the collection', async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
    const duplicate = [WORKOUT_TEMPLATES[0], WORKOUT_TEMPLATES[0]];
    await expect(templates.replaceAll(duplicate)).rejects.toThrow(/unique/);
    expect((await list()).body).toHaveLength(WORKOUT_TEMPLATES.length);
  });

  it('rejects invalid seed data before writing anything', async () => {
    await templates.replaceAll(WORKOUT_TEMPLATES);
    const [plan] = WORKOUT_TEMPLATES;
    const exercise = plan.exercises[0];
    const invalid = [
      { ...plan, durationMinutes: 12.5 },
      { ...plan, exercises: [{ ...exercise, sets: 2.5 }] },
      { ...plan, exercises: [{ ...exercise, reps: 10, durationSeconds: 30 }] },
      { ...plan, exercises: [{ ...exercise, reps: 0, durationSeconds: 0 }] },
    ];
    for (const template of invalid) {
      await expect(
        templates.replaceAll([template, ...WORKOUT_TEMPLATES.slice(1)]),
      ).rejects.toThrow();
    }
    expect((await list()).body).toEqual(WORKOUT_TEMPLATES);
  });

  it('fills defaults for fields missing from older documents', async () => {
    await templates.replaceAll([]);
    await model.collection.insertOne({
      _id: 'legacy' as never,
      name: 'Legacy',
      durationMinutes: 10,
      level: 'Beginner',
      category: 'Mobility',
      exercises: [
        { id: 'e', name: 'E', muscleGroup: 'Core', sets: 1, reps: 5 },
      ],
    });
    const [legacy] = (await list()).body;
    expect(legacy).toMatchObject({ id: 'legacy', description: '' });
    expect(legacy.exercises[0]).toMatchObject({
      durationSeconds: 0,
      restSeconds: 45,
      weightKg: 0,
    });
  });

  it('returns an empty list when there are no templates', async () => {
    await templates.replaceAll([]);
    expect((await list()).body).toEqual([]);
  });
});
