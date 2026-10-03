import {
  INestApplication,
  NestApplicationOptions,
  ValidationPipe,
} from '@nestjs/common';
import { json } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

/** Bulk sync uploads up to 500 documents; only those routes get 2 MB. */
export const BULK_BODY_LIMIT = '2mb';
export const DEFAULT_BODY_LIMIT = '100kb';

/**
 * Options for NestFactory.create / createNestApplication. Nest's own body
 * parser is off so [configureApp] can give routes different size limits.
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** App-wide settings shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use('/api/me/docs', json({ limit: BULK_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
