/** Canonical layout of a generated project. Generators and `validate` both rely on it. */
export const LAYOUT = {
  main: 'src/main.ts',
  schemaIndex: 'src/schema/index.ts',
  seedsIndex: 'src/seeds/index.ts',
  contractsDir: 'src/contracts',
  servicesDir: 'src/services',
  servicesIndex: 'src/services/index.ts',
  controllersDir: 'src/api/controllers',
  controllersIndex: 'src/api/controllers/index.ts',
  jobsDir: 'src/jobs',
  jobsIndex: 'src/jobs/index.ts',
  integrationsDir: 'src/integrations',
} as const;

/** Registry markers: generated lines are inserted above the line containing the marker. */
export const MARKERS = {
  imports: 'mariachi:imports',
  schema: 'mariachi:schema',
  services: 'mariachi:services',
  controllers: 'mariachi:controllers',
  jobs: 'mariachi:jobs',
} as const;
