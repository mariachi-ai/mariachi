import { trace, SpanStatusCode, type Span as OTELSpan } from '@opentelemetry/api';
import type { Span, TracerAdapter } from '../../types';

function wrapSpan(otelSpan: OTELSpan): Span {
  return {
    setAttribute(key: string, value: string | number | boolean) {
      otelSpan.setAttribute(key, value);
    },
    setStatus(status: 'ok' | 'error', message?: string) {
      otelSpan.setStatus({
        code: status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        message,
      });
    },
    end() {
      otelSpan.end();
    },
  };
}

export class OpenTelemetryTracerAdapter implements TracerAdapter {
  private readonly tracer;

  constructor(private readonly serviceName: string = 'mariachi') {
    this.tracer = trace.getTracer(serviceName);
  }

  startSpan(name: string, attributes?: Record<string, string>): Span {
    const otelSpan = this.tracer.startSpan(name, { attributes });
    return wrapSpan(otelSpan);
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    const otelSpan = this.tracer.startSpan(name);
    const wrapped = wrapSpan(otelSpan);
    try {
      const result = await fn(wrapped);
      otelSpan.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      otelSpan.recordException(error as Error);
      throw error;
    } finally {
      otelSpan.end();
    }
  }
}
