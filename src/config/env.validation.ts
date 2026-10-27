import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsInt,
  IsNotEmpty,
  IsString,
  MinLength,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Environment variables the API needs; validated once at startup. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  @IsNotEmpty()
  MONGODB_URI: string;

  /**
   * Comma-separated OAuth client IDs accepted as the `aud` of Google ID
   * tokens — the web client ID the app passes as `serverClientId`.
   */
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_IDS: string;

  /** HMAC secret for access tokens; at least 32 characters. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  /** Access token lifetime in seconds (default 15 minutes). */
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  /** Admin-web access token lifetime in seconds (default 8 hours). */
  @IsInt()
  @Min(300)
  ADMIN_TOKEN_TTL_SECONDS: number = 28800;

  /** Requests per minute per client IP on the /auth routes and DELETE /me. */
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT: number = 20;

  /**
   * Reverse-proxy hops in front of the API (0 = none). Needed so rate
   * limits key on the real client IP (X-Forwarded-For), not the proxy's.
   */
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS: number = 0;

  /** Serve Swagger UI at /api/docs; defaults to on except in production. */
  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: 'true' | 'false';

  /**
   * Comma-separated browser origins allowed by CORS. Empty (default):
   * CORS stays off — the mobile app does not need it.
   */
  @IsString()
  CORS_ORIGINS: string = '';

  /** Refresh token lifetime in days (default 30). */
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  /** OpenAI API key used by the /api/ai endpoints; empty disables AI features. */
  @IsString()
  OPENAI_API_KEY: string = '';

  /** OpenAI model for structured JSON completions (default gpt-6-luna). */
  @IsString()
  @IsNotEmpty()
  OPENAI_MODEL: string = 'gpt-6-luna';

  /** OpenAI API base URL (overridable in tests or for compatible gateways). */
  @IsString()
  @IsNotEmpty()
  OPENAI_BASE_URL: string = 'https://api.openai.com/v1';
}

/** Splits a comma-separated variable, dropping blanks. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** An exact browser origin, as CORS compares it. */
const ORIGIN_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

/** Whether Swagger UI is served (explicit flag, else not in production). */
export function swaggerEnabled(
  env: Pick<EnvironmentVariables, 'NODE_ENV' | 'SWAGGER_ENABLED'>,
): boolean {
  if (env.SWAGGER_ENABLED !== undefined) return env.SWAGGER_ENABLED === 'true';
  return env.NODE_ENV !== NodeEnv.Production;
}

/** Fails fast with every invalid variable listed, instead of at first use. */
export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('\n  ');
    throw new Error(`Invalid environment:\n  ${details}`);
  }
  const badOrigin = splitList(env.CORS_ORIGINS).find(
    (origin) => !ORIGIN_PATTERN.test(origin),
  );
  if (badOrigin !== undefined) {
    throw new Error(
      `Invalid environment:\n  CORS_ORIGINS entry "${badOrigin}" must be scheme://host[:port] with no path or wildcard`,
    );
  }
  if (splitList(env.GOOGLE_CLIENT_IDS).length === 0) {
    throw new Error(
      'Invalid environment:\n  GOOGLE_CLIENT_IDS must list at least one ID',
    );
  }
  return env;
}
