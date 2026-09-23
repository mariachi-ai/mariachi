export interface Disposable {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Disposable).connect === 'function' &&
    typeof (value as Disposable).disconnect === 'function' &&
    typeof (value as Disposable).isHealthy === 'function'
  );
}
