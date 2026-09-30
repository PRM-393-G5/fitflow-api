import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { TemplatesModule } from './templates/templates.module.js';

/**
 * Just enough of the app to seed data: config (only MONGODB_URI is used),
 * the database connection and the templates module — no auth secrets or
 * HTTP layer required.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config: Record<string, unknown>) => {
        if (typeof config.MONGODB_URI !== 'string' || !config.MONGODB_URI) {
          throw new Error('Set MONGODB_URI (or create .env) before seeding');
        }
        return config;
      },
    }),
    DatabaseModule,
    TemplatesModule,
  ],
})
export class SeedModule {}
