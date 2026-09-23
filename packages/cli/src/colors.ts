import { readEnv } from '@mariachi/config';

const enabled = Boolean(process.stdout.isTTY) && readEnv('NO_COLOR') === undefined;

const wrap = (code: string) => (enabled ? `\x1b[${code}m` : '');

export const RED = wrap('31');
export const GREEN = wrap('32');
export const YELLOW = wrap('33');
export const DIM = wrap('2');
export const RESET = wrap('0');
