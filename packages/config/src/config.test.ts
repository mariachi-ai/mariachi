import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ConfigError } from '@mariachi/core';
import {
  loadConfig,
  useConfig,
  resetConfig,
  registerConfigSection,
  useConfigSection,
  createSecrets,
  createFeatureFlags,
  EnvSecretsAdapter,
  Secrets,
} from './index';

beforeEach(() => resetConfig());

describe('loadConfig', () => {
  it('merges env and overrides, and useConfig returns the same object', () => {
    const config = loadConfig({ serviceName: 'svc' }, { env: { PORT: '4000', DATABASE_URL: 'postgres://u:p@h:5432/db' } });
    expect(config.server.port).toBe(4000);
    expect(config.serviceName).toBe('svc');
    expect(config.database?.url).toContain('postgres://');
    expect(useConfig()).toBe(config);
  });

  it('reads AI fallbacks and cost table from env', () => {
    const config = loadConfig({}, {
      env: { AI_FALLBACK_MODELS: 'gpt-4o, gpt-4o-mini', AI_COST_TABLE: '{"claude-sonnet-5":{"input":0.003,"output":0.015}}' },
    });
    expect(config.ai?.fallbackModels).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(config.ai?.costTable?.['claude-sonnet-5']).toEqual({ input: 0.003, output: 0.015 });
    expect(() => loadConfig({}, { env: { AI_COST_TABLE: '{nope' } })).toThrow(ConfigError);
  });

  it('throws ConfigError with readable issues on invalid input', () => {
    expect(() => loadConfig({}, { env: { DATABASE_URL: 'not a url' } })).toThrow(ConfigError);
    try {
      loadConfig({}, { env: { DATABASE_URL: 'not a url' } });
    } catch (e) {
      expect((e as ConfigError).message).toContain('database.url');
    }
  });

  it('defaults observability adapters to noop', () => {
    const config = loadConfig({ observability: { tracing: {}, errors: {} } }, { env: {} });
    expect(config.observability?.tracing?.adapter).toBe('noop');
    expect(config.observability?.errors?.adapter).toBe('noop');
  });

  it('validates registered package sections', () => {
    registerConfigSection('widgets', {
      schema: z.object({ size: z.coerce.number().default(3) }),
      fromEnv: (read) => ({ size: read('WIDGET_SIZE') }),
    });
    loadConfig({}, { env: { WIDGET_SIZE: '7' } });
    expect(useConfigSection<{ size: number }>('widgets').size).toBe(7);
  });
});

describe('secrets', () => {
  it('getOrThrow throws ConfigError for missing secrets and never mutates process.env', async () => {
    const secrets = new Secrets(new EnvSecretsAdapter({ API_KEY: 'k', TENANT_ACME_API_KEY: 'tk' }));
    expect(await secrets.getOrThrow('API_KEY')).toBe('k');
    expect(await secrets.getForTenant('API_KEY', 'acme')).toBe('tk');
    await expect(secrets.getOrThrow('MISSING')).rejects.toMatchObject({ code: 'config/missing-secret' });
    await secrets.set('NEW_ONE', 'v');
    expect(process.env.NEW_ONE).toBeUndefined();
    expect(createSecrets()).toBeInstanceOf(Secrets);
  });
});

describe('feature flags', () => {
  it('evaluates tenant overrides, allowlists and rollouts', async () => {
    const flags = createFeatureFlags({
      adapter: 'store',
      cacheTtlMs: 0,
      store: {
        async get(key) {
          if (key === 'beta') return { key, enabled: false, tenantOverrides: { acme: true }, metadata: { users: ['u1'] } };
          if (key === 'half') return { key, enabled: true, metadata: { rolloutPercent: 50 } };
          return null;
        },
      },
    });
    expect(await flags.isEnabled('beta')).toBe(false);
    expect(await flags.isEnabled('beta', { tenantId: 'acme' })).toBe(true);
    expect(await flags.isEnabled('beta', { userId: 'u1' })).toBe(true);
    expect(await flags.isEnabled('missing')).toBe(false);

    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => flags.isEnabled('half', { userId: `u${i}` })));
    const on = results.filter(Boolean).length;
    expect(on).toBeGreaterThan(60);
    expect(on).toBeLessThan(140);
    expect(await flags.isEnabled('half', { userId: 'stable' })).toBe(await flags.isEnabled('half', { userId: 'stable' }));
  });
});
