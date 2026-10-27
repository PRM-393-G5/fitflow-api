import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module.js';
import { WORKOUT_TEMPLATES } from './templates/seed/workout-templates.seed.js';
import { TemplatesService } from './templates/templates.service.js';

/**
 * `npm run seed`: adds the built-in workout templates that are missing,
 * leaving templates edited in the admin web alone. `npm run seed --
 * --reset` makes the collection match the built-ins exactly instead
 * (overwrites edits, deletes templates the admin added).
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
      const result = await templates.insertMissing(WORKOUT_TEMPLATES);
      process.stdout.write(
        `Added ${result.inserted} missing built-in workout templates\n`,
      );
    }
  } finally {
    await app.close();
  }
}
await seed();
