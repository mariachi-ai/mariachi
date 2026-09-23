import type { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { loadOptionalPeer } from '@mariachi/core';
import type { MetricsAdapter } from '../../types';

type PromClient = typeof import('prom-client');

export interface MetricDefinition {
  type: 'counter' | 'gauge' | 'histogram';
  help?: string;
  labelNames: string[];
  buckets?: number[];
}

type AnyMetric = Counter | Gauge | Histogram;

/**
 * Labels are fixed per metric. Declare them up front with `define()`, or they are taken
 * from the first call's tags. Later calls never throw: unknown labels are dropped and
 * missing labels are filled with an empty string.
 */
export class PrometheusMetricsAdapter implements MetricsAdapter {
  readonly registry: Registry;
  private readonly prom: PromClient;
  private readonly metrics = new Map<string, { metric: AnyMetric; labelNames: string[] }>();
  private readonly definitions = new Map<string, MetricDefinition>();
  private readonly prefix: string;

  constructor(options: { registry?: Registry; prefix?: string; collectDefaultMetrics?: boolean } = {}) {
    this.prom = loadOptionalPeer<PromClient>('prom-client', 'PrometheusMetricsAdapter', import.meta.url);
    this.registry = options.registry ?? new this.prom.Registry();
    this.prefix = options.prefix ?? '';
    if (options.collectDefaultMetrics) this.prom.collectDefaultMetrics({ register: this.registry });
  }

  define(name: string, definition: MetricDefinition): this {
    this.definitions.set(this.sanitize(name), definition);
    return this;
  }

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const { metric, labels } = this.get('counter', name, tags);
    (metric as Counter).inc(labels, value);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const { metric, labels } = this.get('gauge', name, tags);
    (metric as Gauge).set(labels, value);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const { metric, labels } = this.get('histogram', name, tags);
    (metric as Histogram).observe(labels, value);
  }

  timing(name: string, value: number, tags?: Record<string, string>): void {
    this.histogram(`${name}_duration_ms`, value, tags);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  private get(type: MetricDefinition['type'], rawName: string, tags: Record<string, string> = {}) {
    const name = this.sanitize(rawName);
    const key = `${type}:${name}`;
    let entry = this.metrics.get(key);
    if (!entry) {
      const def = this.definitions.get(name);
      const labelNames = def?.labelNames ?? Object.keys(tags).map((k) => this.sanitize(k)).sort();
      const config = { name: this.prefix + name, help: def?.help ?? name, labelNames, registers: [this.registry] };
      const metric =
        type === 'counter'
          ? new this.prom.Counter(config)
          : type === 'gauge'
            ? new this.prom.Gauge(config)
            : new this.prom.Histogram(def?.buckets ? { ...config, buckets: def.buckets } : config);
      entry = { metric, labelNames };
      this.metrics.set(key, entry);
    }
    const labels: Record<string, string> = {};
    for (const label of entry.labelNames) labels[label] = '';
    for (const [k, v] of Object.entries(tags)) {
      const label = this.sanitize(k);
      if (label in labels) labels[label] = String(v);
    }
    return { metric: entry.metric, labels };
  }

  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
