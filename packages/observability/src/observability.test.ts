import { describe, it, expect } from 'vitest';
import { PrometheusMetricsAdapter } from './adapters/metrics/prometheus';
import { createObservability, createTracer } from './index';

describe('PrometheusMetricsAdapter', () => {
  it('never throws on labels that differ between calls', async () => {
    const m = new PrometheusMetricsAdapter();
    m.increment('notifications.dispatched', 1, { channel: 'email' });
    expect(() => m.increment('notifications.dispatched', 1, { channel: 'sms', category: 'marketing' })).not.toThrow();
    expect(() => m.increment('notifications.dispatched')).not.toThrow();
    const out = await m.render();
    expect(out).toContain('notifications_dispatched{channel="email"} 1');
    expect(out).toContain('notifications_dispatched{channel="sms"} 1');
  });

  it('honors declared label sets', async () => {
    const m = new PrometheusMetricsAdapter().define('http.requests', { type: 'counter', labelNames: ['route', 'status'] });
    m.increment('http.requests', 1, { status: '200' });
    expect(await m.render()).toContain('http_requests{route="",status="200"} 1');
  });

  it('records histograms and timings', async () => {
    const m = new PrometheusMetricsAdapter();
    m.timing('db.query', 12, { op: 'select' });
    expect(await m.render()).toContain('db_query_duration_ms_bucket');
  });
});

describe('factories', () => {
  it('defaults to noop tracer/metrics/errors and fails on unknown adapters', () => {
    const o = createObservability({ logging: { adapter: 'console' } });
    expect(o.tracer).toBeDefined();
    expect(() => createTracer({ adapter: 'bogus' })).toThrow(/Unknown tracer adapter/);
  });
});
