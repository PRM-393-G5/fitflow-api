import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AiService } from '../src/ai/ai.service.js';
import { AiUsage } from '../src/ai/schemas/ai-usage.schema.js';
import { EnvironmentVariables } from '../src/config/env.validation.js';
import { createTestApp, signedInUser } from './helpers.js';

describe('/api/ai (e2e)', () => {
  let app: INestApplication<App>;
  let mockOpenAi: Server;
  let mockPort: number;
  let nextStatus = 200;
  let nextBody: unknown = {};
  let lastRequestBody: Record<string, unknown> | null = null;

  beforeAll(async () => {
    mockOpenAi = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          lastRequestBody = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          ) as Record<string, unknown>;
        } catch {
          lastRequestBody = null;
        }
        res.statusCode = nextStatus;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          typeof nextBody === 'string' ? nextBody : JSON.stringify(nextBody),
        );
      });
    });
    await new Promise<void>((resolve) =>
      mockOpenAi.listen(0, '127.0.0.1', () => resolve()),
    );
    mockPort = (mockOpenAi.address() as AddressInfo).port;

    const fakeConfig = {
      get: (key: string) =>
        ({
          OPENAI_API_KEY: 'sk-e2e-test-key',
          OPENAI_MODEL: 'gpt-6-luna',
          OPENAI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
        })[key],
    } as unknown as ConfigService<EnvironmentVariables, true>;

    app = await createTestApp((builder) =>
      builder.overrideProvider(AiService).useValue(new AiService(fakeConfig)),
    );
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => mockOpenAi.close(() => resolve()));
  });

  it('GET /api/ai/status reports configured=true and model name', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai/status')
      .expect(200);
    expect(res.body).toEqual({
      configured: true,
      model: 'gpt-6-luna',
    });
  });

  it('POST /api/ai/generate forwards structured schema and returns parsed JSON', async () => {
    nextStatus = 200;
    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Great depth on all reps.',
              tips: ['Keep chest up on rep 3'],
            }),
          },
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/ai/generate')
      .send({
        system: 'You are a coach.',
        user: 'Review squat set.',
        schemaName: 'form_review',
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            tips: { type: 'array', items: { type: 'string' } },
          },
        },
      })
      .expect(200);

    expect(res.body).toEqual({
      summary: 'Great depth on all reps.',
      tips: ['Keep chest up on rep 3'],
    });
    expect(lastRequestBody?.model).toBe('gpt-6-luna');
  });

  it('POST /api/ai/workout-plan, /meal-plan, /food-photo, /form-review succeed', async () => {
    nextStatus = 200;
    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              name: 'Push Day',
              description: 'Upper push',
              level: 'Intermediate',
              category: 'Strength',
              durationMinutes: 45,
              exercises: [],
            }),
          },
        },
      ],
    };

    const workoutRes = await request(app.getHttpServer())
      .post('/api/ai/workout-plan')
      .send({
        request: 'Push day with dumbbells',
        level: 'Intermediate',
        durationMinutes: 45,
      })
      .expect(200);
    expect(workoutRes.body.name).toBe('Push Day');

    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              meals: [{ label: 'Breakfast', items: [] }],
              totalKcal: 2000,
              note: 'Hit your protein target.',
            }),
          },
        },
      ],
    };
    const mealRes = await request(app.getHttpServer())
      .post('/api/ai/meal-plan')
      .send({ targetKcal: 2000, proteinG: 150, meals: 3 })
      .expect(200);
    expect(mealRes.body.totalKcal).toBe(2000);

    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              dishes: [
                {
                  name: 'Pho Bo',
                  kcal: 480,
                  proteinG: 32,
                  carbsG: 55,
                  fatG: 12,
                },
              ],
              note: 'Standard bowl.',
            }),
          },
        },
      ],
    };
    const photoRes = await request(app.getHttpServer())
      .post('/api/ai/food-photo')
      .send({
        imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'),
      })
      .expect(200);
    expect(photoRes.body.dishes[0].name).toBe('Pho Bo');

    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Solid squat set.',
              tips: ['Drive knees out'],
            }),
          },
        },
      ],
    };
    const formRes = await request(app.getHttpServer())
      .post('/api/ai/form-review')
      .send({
        exercise: 'Squat',
        reps: [
          {
            number: 1,
            minKneeAngle: 82,
            descentMs: 1100,
            ascentMs: 900,
            faults: [],
          },
        ],
      })
      .expect(200);
    expect(formRes.body.summary).toBe('Solid squat set.');
  });

  it('maps OpenAI refusal, length truncation and rate-limit to stable codes', async () => {
    nextStatus = 200;
    nextBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: { refusal: 'Cannot fulfill request.' },
        },
      ],
    };
    const refused = await request(app.getHttpServer())
      .post('/api/ai/generate')
      .send({
        system: 'sys',
        user: 'usr',
        schemaName: 'test',
        schema: { type: 'object' },
      })
      .expect(422);
    expect(refused.body.message).toBe('refused');

    nextBody = {
      choices: [
        {
          finish_reason: 'length',
          message: { content: '{"partial":' },
        },
      ],
    };
    const tooLong = await request(app.getHttpServer())
      .post('/api/ai/generate')
      .send({
        system: 'sys',
        user: 'usr',
        schemaName: 'test',
        schema: { type: 'object' },
      })
      .expect(502);
    expect(tooLong.body.message).toBe('too-long');

    nextStatus = 429;
    nextBody = { error: { message: 'Rate limit exceeded' } };
    const rateLimited = await request(app.getHttpServer())
      .post('/api/ai/generate')
      .send({
        system: 'sys',
        user: 'usr',
        schemaName: 'test',
        schema: { type: 'object' },
      })
      .expect(429);
    expect(rateLimited.body.message).toBe('rate-limited');
  });

  describe('usage log', () => {
    let usage: Model<AiUsage>;
    const okBody = {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ summary: 'ok', tips: [] }) },
        },
      ],
    };
    const review = () =>
      request(app.getHttpServer())
        .post('/api/ai/form-review')
        .send({
          exercise: 'Squat',
          reps: [
            {
              number: 1,
              minKneeAngle: 82,
              descentMs: 1100,
              ascentMs: 900,
              faults: [],
            },
          ],
        });

    beforeAll(() => {
      usage = app.get(getModelToken(AiUsage.name));
    });

    beforeEach(async () => {
      await usage.deleteMany({});
      nextStatus = 200;
      nextBody = okBody;
    });

    it('records an anonymous call without its content', async () => {
      await review().expect(200);
      const [entry] = await usage.find().lean();
      expect(entry).toMatchObject({
        userId: null,
        feature: 'form-review',
        model: 'gpt-6-luna',
        ok: true,
        errorCode: null,
      });
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(entry).sort()).toEqual(
        [
          '__v',
          '_id',
          'createdAt',
          'durationMs',
          'errorCode',
          'feature',
          'model',
          'ok',
          'userId',
        ].sort(),
      );
    });

    it('attributes the call to a signed-in caller', async () => {
      const user = await signedInUser(app, 'ai-usage-user');
      await review()
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      const [entry] = await usage.find().lean();
      expect(entry.userId?.toString()).toBe(user.userId);
    });

    it('still serves a caller with an invalid token, anonymously', async () => {
      await review().set('Authorization', 'Bearer not-a-jwt').expect(200);
      const [entry] = await usage.find().lean();
      expect(entry.userId).toBeNull();
    });

    it('records failures with the code the app sees', async () => {
      nextStatus = 429;
      nextBody = { error: { message: 'slow down' } };
      const res = await review().expect(429);
      expect(res.body.message).toBe('rate-limited');
      const [entry] = await usage.find().lean();
      expect(entry).toMatchObject({ ok: false, errorCode: 'rate-limited' });
    });

    it('does not record rejected requests or status checks', async () => {
      await request(app.getHttpServer())
        .post('/api/ai/form-review')
        .send({})
        .expect(400);
      await request(app.getHttpServer()).get('/api/ai/status').expect(200);
      expect(await usage.countDocuments()).toBe(0);
    });
  });
});
