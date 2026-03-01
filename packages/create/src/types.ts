export interface ProjectConfig {
  name: string;
  mode: 'monolith' | 'microservice';
  adapters: {
    database: string;
    cache: string;
    queue: string;
    auth: string[];
    storage: string;
    email: string;
  };
  features: string[];
  outputDir: string;
}

export interface GenerateServiceConfig {
  name: string;
  projectRoot: string;
}

export interface GenerateControllerConfig {
  name: string;
  projectRoot: string;
}

export interface GenerateJobConfig {
  name: string;
  projectRoot: string;
}

export interface GenerateIntegrationConfig {
  name: string;
  projectRoot: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

export interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  message: string;
  suggestion?: string;
}

export interface TemplateVariables {
  name: string;
  Name: string;
  'name-kebab': string;
  mode: string;
  adapters: Record<string, string | string[]>;
  features: string[];
  'mariachi.version': string;
  generatedAt: string;
}
