export interface ProjectConfig {
  /** npm package name of the new project. */
  name: string;
  /** Directory to create. It must not exist or must be empty. */
  outputDir: string;
  /** Generate the example `note` entity (schema, service, handlers, controller, test). Default true. */
  example?: boolean;
  /** Override the `@mariachi/*` version range written to package.json. Default `^<framework version>`. */
  mariachiVersion?: string;
}

export interface GenerateOptions {
  name: string;
  /** Project root (the directory containing `src/`). */
  projectRoot: string;
  /** Overwrite files that already exist. */
  force?: boolean;
}

export type GenerateEntityConfig = GenerateOptions;
export type GenerateServiceConfig = GenerateOptions;
export type GenerateControllerConfig = GenerateOptions;
export type GenerateJobConfig = GenerateOptions;
export type GenerateIntegrationConfig = GenerateOptions;

export interface GenerateResult {
  /** Paths relative to the project root. */
  created: string[];
  /** Registry files that were edited. */
  updated: string[];
  /** Manual follow-ups (e.g. a registry marker was missing). */
  notes: string[];
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  filesChecked: number;
}

export interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ValidateOptions {
  /** Rule names to skip. */
  disable?: string[];
}
