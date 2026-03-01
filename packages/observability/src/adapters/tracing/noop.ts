import type { Span, TracerAdapter } from '../../types';

const noopSpan: Span = {
  setAttribute() {},
  setStatus() {},
  end() {},
};

export class NoopTracerAdapter implements TracerAdapter {
  startSpan(): Span {
    return noopSpan;
  }

  async withSpan<T>(_name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return fn(noopSpan);
  }
}
