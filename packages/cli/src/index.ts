import { existsSync } from 'node:fs';
import { createProgram } from './program';

// Variables already set in the environment win over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

createProgram().parse();
