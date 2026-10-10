import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

describe('Auth rate limit (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Must be set before AppModule (and its ConfigModule) is loaded.
    process.env.AUTH_RATE_LIMIT = '3';
    const { createTestApp } = await import('./helpers.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 429 after AUTH_RATE_LIMIT auth requests a minute', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) });
    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const limited = await attempt().expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429 });
  });

  it('does not limit other routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/templates').expect(200);
    }
  });
});
