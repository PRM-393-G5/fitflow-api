import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

describe('Swagger (e2e)', () => {
  let app: INestApplication<App>;
  const previous = process.env.SWAGGER_ENABLED;

  beforeAll(async () => {
    // Must be set before AppModule (and its ConfigModule) is loaded.
    process.env.SWAGGER_ENABLED = 'true';
    const { createTestApp } = await import('./helpers.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    process.env.SWAGGER_ENABLED = previous;
  });

  it('serves the OpenAPI document with every route', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/google',
        '/api/me',
        '/api/me/meta',
        '/api/me/docs/{kind}',
        '/api/me/docs/{kind}/{id}',
        '/api/templates',
      ]),
    );
  });

  it('relaxes the CSP for the docs page only, without forcing HTTPS', async () => {
    const docs = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200);
    const docsCsp = docs.headers['content-security-policy'] as string;
    expect(docsCsp).not.toContain('upgrade-insecure-requests');
    expect(docsCsp).not.toMatch(/script-src[^;]*unsafe-inline/);

    const api = await request(app.getHttpServer()).get('/api').expect(200);
    const apiCsp = api.headers['content-security-policy'] as string;
    // The API keeps helmet's strict defaults.
    expect(apiCsp).toContain('upgrade-insecure-requests');
    expect(apiCsp).toContain("script-src 'self';");
  });
});
