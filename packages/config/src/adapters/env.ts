import { config } from 'dotenv';
import type { SecretsAdapter } from '../types';

config();

export class EnvSecretsAdapter implements SecretsAdapter {
  async get(key: string, _tenantId?: string): Promise<string | undefined> {
    return process.env[key];
  }

  async set(key: string, value: string, _tenantId?: string): Promise<void> {
    process.env[key] = value;
  }
}
