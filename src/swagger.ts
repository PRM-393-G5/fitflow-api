import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Path of the Swagger UI (JSON at `${DOCS_PATH}-json`). */
export const DOCS_PATH = 'api/docs';

/**
 * Interactive API docs at /api/docs (JSON at /api/docs-json). Building the
 * document scans every route, so it only happens when docs are enabled.
 */
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('FitFlow API')
    .setDescription(
      'Backend for the FitFlow app: Google sign-in, sessions, workout ' +
        'templates and per-user sync. Sign in with POST /api/auth/google, ' +
        'then use the access token with "Authorize".',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}
