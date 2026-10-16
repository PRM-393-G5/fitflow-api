import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvironmentVariables } from '../../config/env.validation.js';

/**
 * Rate limits for routes that talk to Google or mint tokens. Only routes
 * marked with `@UseGuards(ThrottlerGuard)` are limited, and they share
 * one budget per client IP (the default key is per route). Counters live
 * in memory, per API instance; behind a proxy set TRUST_PROXY_HOPS so the
 * IP is the client's.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            name: 'auth',
            ttl: 60_000,
            limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
          },
        ],
        generateKey: (_context, tracker, throttlerName) =>
          `${throttlerName}:${tracker}`,
      }),
    }),
  ],
})
export class ThrottlingModule {}
