import type { Span as OTELSpan, Tracer } from '@opentelemetry/api';
import { loadOptionalPeer } from '@mariachi/core';
import type { Span, TracerAdapter } from '../../types';

type OtelApi = typeof import('@opentelemetry/api');

function wrapSpan(api: OtelApi, otelSpan: OTELSpan): Span {
  return {
    setAttribute(key, value) {
      otelSpan.setAttribute(key, value);
    },
    setStatus(status, message) {
      otelSpan.setStatus({ code: status === 'ok' ? api.SpanStatusCode.OK : api.SpanStatusCode.ERROR, message });
    },
    recordException(error) {
      otelSpan.recordException(error);
    },
    end() {
      otelSpan.end();
    },
  };
}

/**
 * Uses the globally registered OpenTelemetry provider. Call `setupOpenTelemetry()` once at
 * startup (or register your own SDK) so spans are actually exported.
 */
export class OpenTelemetryTracerAdapter implements TracerAdapter {
  private readonly api: OtelApi;
  private readonly tracer: Tracer;

  constructor(serviceName = 'mariachi') {
    this.api = loadOptionalPeer<OtelApi>('@opentelemetry/api', 'OpenTelemetryTracerAdapter', import.meta.url);
    this.tracer = this.api.trace.getTracer(serviceName);
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    return wrapSpan(this.api, this.tracer.startSpan(name, { attributes }));
  }

  /** Runs `fn` inside an active span, so nested spans become children. */
  async withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return this.tracer.startActiveSpan(name, async (otelSpan) => {
      const wrapped = wrapSpan(this.api, otelSpan);
      try {
        const result = await fn(wrapped);
        otelSpan.setStatus({ code: this.api.SpanStatusCode.OK });
        return result;
      } catch (error) {
        otelSpan.recordException(error as Error);
        otelSpan.setStatus({ code: this.api.SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        otelSpan.end();
      }
    });
  }

  /** Active trace id (for log correlation), if any. */
  activeTraceId(): string | undefined {
    return this.api.trace.getActiveSpan()?.spanContext().traceId;
  }
}

export interface OpenTelemetrySetupOptions {
  serviceName: string;
  /** OTLP/HTTP traces endpoint, e.g. http://localhost:4318/v1/traces */
  endpoint?: string;
  headers?: Record<string, string>;
}

/**
 * Starts the OpenTelemetry Node SDK with an OTLP/HTTP exporter. Requires the optional peers
 * `@opentelemetry/sdk-node` and `@opentelemetry/exporter-trace-otlp-http`.
 * Returns a shutdown function to register with the lifecycle ShutdownManager.
 */
export function setupOpenTelemetry(options: OpenTelemetrySetupOptions): () => Promise<void> {
  const sdkNode = loadOptionalPeer<any>('@opentelemetry/sdk-node', 'setupOpenTelemetry', import.meta.url);
  const exporterMod = loadOptionalPeer<any>(
    '@opentelemetry/exporter-trace-otlp-http',
    'setupOpenTelemetry',
    import.meta.url,
  );
  const sdk = new sdkNode.NodeSDK({
    serviceName: options.serviceName,
    traceExporter: new exporterMod.OTLPTraceExporter({ url: options.endpoint, headers: options.headers }),
  });
  sdk.start();
  return () => sdk.shutdown();
}
