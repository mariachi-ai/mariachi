import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from './context';
import { MariachiError } from './errors';

interface Frame {
  ctx: Context;
  /** Arbitrary per-request slots (e.g. the active database transaction). */
  slots: Map<symbol, unknown>;
}

const storage = new AsyncLocalStorage<Frame>();

/** Runs `fn` with `ctx` as the ambient context for all async work it starts. */
export function runWithContext<T>(ctx: Context, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ctx, slots: new Map(parent?.slots) }, fn);
}

export function currentContext(): Context | undefined {
  return storage.getStore()?.ctx;
}

export function requireContext(): Context {
  const ctx = currentContext();
  if (!ctx) throw new MariachiError('context/missing', 'No ambient Context. Wrap the call in runWithContext().');
  return ctx;
}

/** Runs `fn` with an extra ambient slot bound (used for transactions and similar scoped resources). */
export function runWithSlot<T>(key: symbol, value: unknown, fn: () => T): T {
  const parent = storage.getStore();
  const slots = new Map(parent?.slots);
  slots.set(key, value);
  return storage.run({ ctx: parent?.ctx as Context, slots }, fn);
}

export function getSlot<T>(key: symbol): T | undefined {
  return storage.getStore()?.slots.get(key) as T | undefined;
}
