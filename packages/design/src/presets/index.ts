import type { Theme } from '../engine/theme';
import { brutalist } from './brutalist';
import { editorial } from './editorial';
import { enterprise } from './enterprise';
import { minimal } from './minimal';
import { soft } from './soft';
import { terminal } from './terminal';

/** Built-in presets, in display order. */
export const presets = { minimal, brutalist, editorial, soft, enterprise, terminal } satisfies Record<string, Theme>;
export type PresetName = keyof typeof presets;

export { brutalist, editorial, enterprise, minimal, soft, terminal };
