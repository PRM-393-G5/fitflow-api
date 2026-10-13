import {
  NodeEnv,
  splitList,
  swaggerEnabled,
  validateEnv,
} from './env.validation.js';

const required = {
  MONGODB_URI: 'x',
  GOOGLE_CLIENT_IDS: 'client',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and converts types', () => {
    const env = validateEnv({
      ...required,
      MONGODB_URI: 'mongodb://localhost/fitflow',
    });
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3001);

    expect(validateEnv({ ...required, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects an empty MONGODB_URI', () => {
    expect(() => validateEnv({ ...required, MONGODB_URI: '' })).toThrow(
      /MONGODB_URI/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...required, PORT: '70000' })).toThrow(/PORT/);
  });

  it('requires GOOGLE_CLIENT_IDS', () => {
    expect(() =>
      validateEnv({ ...required, GOOGLE_CLIENT_IDS: undefined }),
    ).toThrow(/GOOGLE_CLIENT_IDS/);
  });
});

describe('validateEnv JWT settings', () => {
  it('defaults token lifetimes', () => {
    const env = validateEnv(required);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('rejects a short JWT secret', () => {
    expect(() =>
      validateEnv({ ...required, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('validateEnv lists', () => {
  it('rejects GOOGLE_CLIENT_IDS without any ID', () => {
    expect(() =>
      validateEnv({ ...required, GOOGLE_CLIENT_IDS: ' , ' }),
    ).toThrow(/at least one ID/);
  });
});

describe('validateEnv CORS and Swagger', () => {
  it.each(['*', 'https://a.example/', 'a.example', 'https://*.example'])(
    'rejects CORS origin %s',
    (origin) => {
      expect(() => validateEnv({ ...required, CORS_ORIGINS: origin })).toThrow(
        /CORS_ORIGINS/,
      );
    },
  );

  it('accepts exact origins', () => {
    const env = validateEnv({
      ...required,
      CORS_ORIGINS: 'https://admin.example.com, http://localhost:5173',
    });
    expect(splitList(env.CORS_ORIGINS)).toHaveLength(2);
  });

  it('enables Swagger outside production unless told otherwise', () => {
    expect(swaggerEnabled(validateEnv(required))).toBe(true);
    expect(
      swaggerEnabled(validateEnv({ ...required, NODE_ENV: 'production' })),
    ).toBe(false);
    expect(
      swaggerEnabled(
        validateEnv({
          ...required,
          NODE_ENV: 'production',
          SWAGGER_ENABLED: 'true',
        }),
      ),
    ).toBe(true);
    expect(
      swaggerEnabled(validateEnv({ ...required, SWAGGER_ENABLED: 'false' })),
    ).toBe(false);
  });
});

describe('splitList', () => {
  it('splits on commas and drops blanks', () => {
    expect(splitList(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('validateEnv OpenAI settings', () => {
  it('defaults OPENAI_MODEL and OPENAI_BASE_URL when OPENAI_API_KEY is unset', () => {
    const env = validateEnv(required);
    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.OPENAI_MODEL).toBe('gpt-6-luna');
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
  });

  it('accepts custom OpenAI settings', () => {
    const env = validateEnv({
      ...required,
      OPENAI_API_KEY: 'sk-test-key',
      OPENAI_MODEL: 'gpt-4o-mini',
      OPENAI_BASE_URL: 'http://127.0.0.1:4100/v1',
    });
    expect(env.OPENAI_API_KEY).toBe('sk-test-key');
    expect(env.OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(env.OPENAI_BASE_URL).toBe('http://127.0.0.1:4100/v1');
  });
});
