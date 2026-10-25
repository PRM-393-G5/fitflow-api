import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Admin } from '../src/admin/accounts/admin.schema.js';
import { AdminsService } from '../src/admin/accounts/admins.service.js';
import {
  ADMIN_PASSWORD,
  createTestApp,
  signedInAdmin,
  signedInUser,
} from './helpers.js';

describe('Admin auth (e2e)', () => {
  let app: INestApplication<App>;
  let admins: Model<Admin>;

  beforeAll(async () => {
    app = await createTestApp();
    admins = app.get(getModelToken(Admin.name));
  });

  beforeEach(async () => {
    await admins.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
  });

  const login = (body: object) =>
    request(app.getHttpServer()).post('/api/admin/auth/login').send(body);
  const me = (accessToken?: string) => {
    const req = request(app.getHttpServer()).get('/api/admin/me');
    return accessToken
      ? req.set('Authorization', `Bearer ${accessToken}`)
      : req;
  };

  it('logs in with the right password and opens GET /api/admin/me', async () => {
    await app
      .get(AdminsService)
      .upsert(' Boss@Example.com ', ADMIN_PASSWORD, 'Boss');
    const { body } = await login({
      email: 'boss@example.COM',
      password: ADMIN_PASSWORD,
    }).expect(200);
    expect(body).toMatchObject({
      expiresIn: 28800,
      admin: { email: 'boss@example.com', name: 'Boss' },
    });

    const profile = await me(body.accessToken).expect(200);
    expect(profile.body).toEqual(body.admin);
    const stored = await admins.findOne().lean();
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
    expect(stored?.passwordHash).not.toContain(ADMIN_PASSWORD);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await app.get(AdminsService).upsert('boss@example.com', ADMIN_PASSWORD);
    const wrong = await login({
      email: 'boss@example.com',
      password: 'not-the-password',
    }).expect(401);
    const unknown = await login({
      email: 'nobody@example.com',
      password: ADMIN_PASSWORD,
    }).expect(401);
    expect(wrong.body.message).toBe('Invalid email or password');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('validates the body', async () => {
    await login({}).expect(400);
    await login({ email: 'a@b.c' }).expect(400);
    await login({ email: 'a@b.c', password: 'x'.repeat(129) }).expect(400);
    await login({ email: 'a@b.c', password: 'secret', extra: 1 }).expect(400);
  });

  it('resets the password when the admin is created again', async () => {
    const service = app.get(AdminsService);
    expect((await service.upsert('a@example.com', 'first-pass')).created).toBe(
      true,
    );
    expect((await service.upsert('A@example.com', 'second-pass')).created).toBe(
      false,
    );
    await login({ email: 'a@example.com', password: 'first-pass' }).expect(401);
    await login({ email: 'a@example.com', password: 'second-pass' }).expect(
      200,
    );
    expect(await admins.countDocuments()).toBe(1);
  });

  it('signs the admin out everywhere when the password is reset', async () => {
    const admin = await signedInAdmin(app);
    await admin.get('/api/admin/me').expect(200);
    await app
      .get(AdminsService)
      .upsert('admin@example.com', 'a-brand-new-password');
    await admin.get('/api/admin/me').expect(401);
  });

  it('refuses passwords login would reject, and non-emails', async () => {
    const service = app.get(AdminsService);
    await expect(service.upsert('a@example.com', 'short')).rejects.toThrow(
      '8 to 128 characters',
    );
    await expect(
      service.upsert('a@example.com', 'x'.repeat(129)),
    ).rejects.toThrow('8 to 128 characters');
    await expect(service.upsert('not-an-email', 'long-enough')).rejects.toThrow(
      'Not an email',
    );
  });

  it('rejects missing, malformed and app-user tokens', async () => {
    await me().expect(401);
    await me('not-a-jwt').expect(401);
    const user = await signedInUser(app, 'admin-auth-user');
    await me(user.accessToken).expect(401);
  });

  it('does not accept admin tokens on app routes', async () => {
    const admin = await signedInAdmin(app);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(401);
  });

  it('locks out an admin as soon as the account is removed', async () => {
    const admin = await signedInAdmin(app);
    await admin.get('/api/admin/me').expect(200);
    await admins.deleteMany({});
    await admin.get('/api/admin/me').expect(401);
  });
});
