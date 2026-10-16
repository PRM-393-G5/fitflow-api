import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Interactive API docs at /api/docs (JSON at /api/docs-json). */
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
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
