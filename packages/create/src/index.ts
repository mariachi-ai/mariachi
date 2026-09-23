export {
  createProject,
  generateEntity,
  generateService,
  generateController,
  generateJob,
  generateIntegration,
} from './generators';
export { validate, RULES } from './validate/index';
export { names, pluralize, type Names } from './names';
export { LAYOUT, MARKERS } from './layout';
export { MARIACHI_VERSION } from './version';

export type {
  ProjectConfig,
  GenerateOptions,
  GenerateEntityConfig,
  GenerateServiceConfig,
  GenerateControllerConfig,
  GenerateJobConfig,
  GenerateIntegrationConfig,
  GenerateResult,
  ValidateOptions,
  ValidationResult,
  Violation,
} from './types';
export type { Rule } from './validate/rules';
