import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AdminsService } from '../src/admin/accounts/admins.service.js';
import { AppModule } from '../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { TokensService } from '../src/auth/tokens/tokens.service.js';
import { UsersService } from '../src/users/users.service.js';

/**
 * The full HTTP app, configured like main.ts. [customize] can override
 * providers (e.g. fake Google) before compiling.
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication<App>> {
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app =
    moduleRef.createNestApplication<INestApplication<App>>(APP_OPTIONS);
  configureApp(app);
  await app.init();
  return app;
}

/** Creates (or reuses) a user and returns an authorised request helper. */
export async function signedInUser(app: INestApplication<App>, sub: string) {
  const user = await app
    .get(UsersService)
    .upsertFromGoogle({ sub, email: `${sub}@example.com` });
  const { accessToken } = await app.get(TokensService).issue(user.id as string);
  return {
    userId: user.id as string,
    accessToken,
    ...authorizedRequests(app, accessToken),
  };
}

export const ADMIN_PASSWORD = 'admin-password-1';

/**
 * Creates (or resets) an admin, signs in through the login route and
 * returns an authorised request helper for `/api/admin/*`.
 */
export async function signedInAdmin(
  app: INestApplication<App>,
  email = 'admin@example.com',
) {
  const { admin } = await app
    .get(AdminsService)
    .upsert(email, ADMIN_PASSWORD, 'Admin');
  const login = await request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password: ADMIN_PASSWORD })
    .expect(200);
  const accessToken = login.body.accessToken as string;
  return {
    adminId: admin.id as string,
    accessToken,
    ...authorizedRequests(app, accessToken),
  };
}

/** Request builders that send `Authorization: Bearer [accessToken]`. */
function authorizedRequests(app: INestApplication<App>, accessToken: string) {
  const server = app.getHttpServer();
  const auth = { Authorization: `Bearer ${accessToken}` };
  const withBody =
    (method: 'post' | 'put' | 'patch') => (path: string, body?: unknown) =>
      request(server)
        [method](path)
        .set(auth)
        .send(body as object);
  return {
    get: (path: string) => request(server).get(path).set(auth),
    post: withBody('post'),
    put: withBody('put'),
    patch: withBody('patch'),
    delete: (path: string) => request(server).delete(path).set(auth),
  };
}
