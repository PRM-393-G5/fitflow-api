import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokensService } from '../src/auth/tokens/tokens.service.js';
import { UsersService } from '../src/users/users.service.js';

/** The full HTTP app, configured like main.ts. */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
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
  const auth = { Authorization: `Bearer ${accessToken}` };
  const server = app.getHttpServer();
  return {
    userId: user.id as string,
    accessToken,
    get: (path: string) => request(server).get(path).set(auth),
    put: (path: string, body: unknown) =>
      request(server)
        .put(path)
        .set(auth)
        .send(body as object),
    delete: (path: string) => request(server).delete(path).set(auth),
  };
}
