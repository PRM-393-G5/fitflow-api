import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

describe('Auth rate limit (e2e)', () => {
  let app: INestApplication<App>;
  const previous = process.env.AUTH_RATE_LIMIT;
  const previousAdmin = process.env.ADMIN_LOGIN_RATE_LIMIT;
  const previousAi = process.env.AI_RATE_LIMIT;

  beforeAll(async () => {
    // Must be set before AppModule (and its ConfigModule) is loaded.
    process.env.AUTH_RATE_LIMIT = '3';
    process.env.ADMIN_LOGIN_RATE_LIMIT = '2';
    process.env.AI_RATE_LIMIT = '2';
    const { createTestApp } = await import('./helpers.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    process.env.AUTH_RATE_LIMIT = previous;
    process.env.ADMIN_LOGIN_RATE_LIMIT = previousAdmin;
    process.env.AI_RATE_LIMIT = previousAi;
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

  it('gives admin login its own budget', async () => {
    // A fresh app: its throttler counters start at zero.
    const { createTestApp } = await import('./helpers.js');
    const fresh = await createTestApp();
    try {
      const server = fresh.getHttpServer();
      const login = () =>
        request(server)
          .post('/api/admin/auth/login')
          .send({ email: 'nobody@example.com', password: 'wrong-password' });
      await login().expect(401);
      await login().expect(401);
      await login().expect(429);
      // App sign-in traffic from the same IP is unaffected...
      for (let i = 0; i < 3; i++) {
        await request(server)
          .post('/api/auth/refresh')
          .send({ refreshToken: 'x'.repeat(43) })
          .expect(401);
      }
      // ...and exhausting it leaves admin login's counter where it was.
      await request(server)
        .post('/api/auth/logout')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(429);
      await login().expect(429);
    } finally {
      await fresh.close();
    }
  });

  it('limits AI calls per user, not per IP', async () => {
    const { createTestApp, signedInUser } = await import('./helpers.js');
    const fresh = await createTestApp();
    try {
      const first = await signedInUser(fresh, 'rate-ai-1');
      const second = await signedInUser(fresh, 'rate-ai-2');
      // Validation fails (400) after the guards: each call still counts.
      await first.post('/api/ai/workout-plan', {}).expect(400);
      await first.post('/api/ai/workout-plan', {}).expect(400);
      await first.post('/api/ai/workout-plan', {}).expect(429);
      // Same IP, another user: their own budget.
      await second.post('/api/ai/workout-plan', {}).expect(400);
      // AI traffic leaves the sign-in budget alone.
      await request(fresh.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
    } finally {
      await fresh.close();
    }
  });

  it('does not limit other routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/templates').expect(200);
    }
  });
});
