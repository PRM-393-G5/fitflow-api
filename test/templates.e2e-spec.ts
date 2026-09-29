import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { WORKOUT_TEMPLATES } from '../src/templates/seed/workout-templates.seed.js';
import { TemplatesService } from '../src/templates/templates.service.js';

describe('Templates (e2e)', () => {
  let app: INestApplication<App>;
  let templates: TemplatesService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    templates = moduleRef.get(TemplatesService);
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

  it('is idempotent and removes templates dropped from the seed', async () => {
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

  it('returns an empty list when there are no templates', async () => {
    await templates.replaceAll([]);
    expect((await list()).body).toEqual([]);
  });
});
