import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module.js';
import { WORKOUT_TEMPLATES } from './templates/seed/workout-templates.seed.js';
import { TemplatesService } from './templates/templates.service.js';

/**
 * `npm run seed`: loads the built-in workout templates into an empty
 * collection and leaves an existing one alone (the admin web manages it).
 * `npm run seed -- --reset` makes the collection match the built-ins
 * exactly instead (overwrites edits, deletes templates the admin added).
 */
async function seed() {
  const reset = process.argv.includes('--reset');
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });
  try {
    const templates = app.get(TemplatesService);
    if (reset) {
      const result = await templates.replaceAll(WORKOUT_TEMPLATES);
      process.stdout.write(
        `Reset to ${result.upserted} built-in workout templates (${result.deleted} removed)\n`,
      );
    } else {
      const { inserted } = await templates.seedIfEmpty(WORKOUT_TEMPLATES);
      process.stdout.write(
        inserted > 0
          ? `Loaded ${inserted} built-in workout templates\n`
          : 'Templates already present; nothing loaded (use --reset to replace them)\n',
      );
    }
  } finally {
    await app.close();
  }
}
await seed();
