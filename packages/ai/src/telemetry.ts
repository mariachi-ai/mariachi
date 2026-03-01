import type { AITelemetryEntry } from './types';

export class AITelemetryTracker {
  private entries: AITelemetryEntry[] = [];

  record(entry: AITelemetryEntry): void {
    this.entries.push(entry);
  }

  getEntries(sessionId?: string): AITelemetryEntry[] {
    if (sessionId) {
      return this.entries.filter((e) => e.sessionId === sessionId);
    }
    return [...this.entries];
  }
}
