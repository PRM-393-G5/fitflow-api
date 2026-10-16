import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

describe('Auth rate limit (e2e)', () => {
  let app: INestApplication<App>;
  const previous = process.env.AUTH_RATE_LIMIT;

  beforeAll(async () => {
    // Must be set before AppModule (and its ConfigModule) is loaded.
    process.env.AUTH_RATE_LIMIT = '3';
    const { createTestApp } = await import('./helpers.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    process.env.AUTH_RATE_LIMIT = previous;
  });

  it('shares one AUTH_RATE_LIMIT budget across the auth routes', async () => {
    const server = app.getHttpServer();
    const refreshToken = 'x'.repeat(43);
    await request(server)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    await request(server)
      .post('/api/auth/logout')
      .send({ refreshToken })
      .expect(204);
    await request(server)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    // Fourth auth request of the minute, on yet another route.
    const limited = await request(server)
      .post('/api/auth/logout')
      .send({ refreshToken })
      .expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429 });
  });

  it('does not limit other routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/templates').expect(200);
    }
  });
});
