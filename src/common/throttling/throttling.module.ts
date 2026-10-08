import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvironmentVariables } from '../../config/env.validation.js';

/**
 * Rate limits for routes that talk to Google or mint tokens. Only routes
 * marked with `@UseGuards(ThrottlerGuard)` are limited. Counters live in
 * memory, per API instance.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [
        {
          name: 'auth',
          ttl: 60_000,
          limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
        },
      ],
    }),
  ],
})
export class ThrottlingModule {}
