import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { WORKOUT_TEMPLATES } from './templates/seed/workout-templates.seed.js';
import { TemplatesService } from './templates/templates.service.js';

/** `npm run seed`: loads the built-in workout templates into MongoDB. */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app
      .get(TemplatesService)
      .replaceAll(WORKOUT_TEMPLATES);
    process.stdout.write(
      `Seeded ${result.upserted} workout templates (${result.deleted} removed)\n`,
    );
  } finally {
    await app.close();
  }
}
await seed();
