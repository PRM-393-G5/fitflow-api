import {
  INestApplication,
  NestApplicationOptions,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { json } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import {
  EnvironmentVariables,
  splitList,
  swaggerEnabled,
} from './config/env.validation.js';
import { DOCS_PATH, setupSwagger } from './swagger.js';

/** Bulk sync uploads up to 500 documents; only those routes get 2 MB. */
export const BULK_BODY_LIMIT = '2mb';
export const DEFAULT_BODY_LIMIT = '100kb';

/**
 * Options for NestFactory.create / createNestApplication. Nest's own body
 * parser is off so [configureApp] can give routes different size limits.
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** Helmet defaults (strict CSP) for the API itself. */
const apiHeaders = helmet();

/**
 * Swagger UI needs inline styles and data:/https: images, and must keep
 * working over plain HTTP on a LAN IP (no upgrade-insecure-requests).
 */
const docsHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      upgradeInsecureRequests: null,
    },
  },
});

/** App-wide settings shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const hops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (hops > 0) {
    (app as NestExpressApplication).set('trust proxy', hops);
  }

  app.setGlobalPrefix('api');
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${DOCS_PATH}`)
      ? docsHeaders(req, res, next)
      : apiHeaders(req, res, next),
  );
  const origins = splitList(config.get('CORS_ORIGINS', { infer: true }));
  if (origins.length > 0) {
    app.enableCors({ origin: origins });
  }
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
  const swagger = swaggerEnabled({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    SWAGGER_ENABLED: config.get('SWAGGER_ENABLED', { infer: true }),
  });
  if (swagger) {
    setupSwagger(app);
  }
  app.enableShutdownHooks();
}
