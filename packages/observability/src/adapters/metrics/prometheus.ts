import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import type { MetricsAdapter } from '../../types';

export class PrometheusMetricsAdapter implements MetricsAdapter {
  readonly registry: Registry;
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();
  private readonly histograms = new Map<string, Histogram>();

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();
  }

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const counter = this.getOrCreateCounter(name);
    if (tags && Object.keys(tags).length > 0) {
      counter.inc(tags, value);
    } else {
      counter.inc(value);
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const gauge = this.getOrCreateGauge(name);
    if (tags && Object.keys(tags).length > 0) {
      gauge.set(tags, value);
    } else {
      gauge.set(value);
    }
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const histogram = this.getOrCreateHistogram(name);
    if (tags && Object.keys(tags).length > 0) {
      histogram.observe(tags, value);
    } else {
      histogram.observe(value);
    }
  }

  timing(name: string, value: number, tags?: Record<string, string>): void {
    this.histogram(`${name}_duration_ms`, value, tags);
  }

  private getOrCreateCounter(name: string): Counter {
    const sanitized = this.sanitizeName(name);
    let counter = this.counters.get(sanitized);
    if (!counter) {
      counter = new Counter({ name: sanitized, help: sanitized, labelNames: ['key', 'event', 'procedure', 'action', 'resource', 'model', 'currency', 'index', 'metric_name', 'event_type', 'type', 'status'], registers: [this.registry] });
      this.counters.set(sanitized, counter);
    }
    return counter;
  }

  private getOrCreateGauge(name: string): Gauge {
    const sanitized = this.sanitizeName(name);
    let gauge = this.gauges.get(sanitized);
    if (!gauge) {
      gauge = new Gauge({ name: sanitized, help: sanitized, labelNames: ['key', 'event', 'procedure', 'model'], registers: [this.registry] });
      this.gauges.set(sanitized, gauge);
    }
    return gauge;
  }

  private getOrCreateHistogram(name: string): Histogram {
    const sanitized = this.sanitizeName(name);
    let histogram = this.histograms.get(sanitized);
    if (!histogram) {
      histogram = new Histogram({ name: sanitized, help: sanitized, labelNames: ['key', 'event', 'procedure', 'action', 'model', 'currency', 'index'], registers: [this.registry] });
      this.histograms.set(sanitized, histogram);
    }
    return histogram;
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
