import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation.js';
import { AiService } from './ai.service.js';

function makeService(overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test-key',
    OPENAI_MODEL: 'gpt-6-luna',
    OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new AiService(config);
}

describe('AiService', () => {
  it('reports configured=false when OPENAI_API_KEY is blank', () => {
    const service = makeService({ OPENAI_API_KEY: '   ' });
    expect(service.configured).toBe(false);
    expect(service.getStatus()).toEqual({
      configured: false,
      model: 'gpt-6-luna',
    });
  });

  it('throws not-configured when generateJson is called without a key', async () => {
    const service = makeService({ OPENAI_API_KEY: '' });
    await expect(
      service.generateJson({
        system: 'sys',
        user: 'usr',
        schema: { type: 'object' },
        schemaName: 'test',
      }),
    ).rejects.toThrow('not-configured');
  });

  it('maps unreachable OpenAI base URL to offline error', async () => {
    const service = makeService({ OPENAI_BASE_URL: 'http://127.0.0.1:1/v1' });
    await expect(
      service.generateJson({
        system: 'sys',
        user: 'usr',
        schema: { type: 'object' },
        schemaName: 'test',
      }),
    ).rejects.toThrow('offline');
  });
});
