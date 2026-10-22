import fs from 'node:fs';
import { renderMarkdown } from '../lib/markdown';
import { fromRoot, once } from '../lib/repo';
import { routeForFile } from './routes';

export const loadRoadmap = once(async () => {
  const file = fromRoot('ROADMAP.md');
  return renderMarkdown(fs.readFileSync(file, 'utf8'), file, routeForFile);
});
