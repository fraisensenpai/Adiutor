import { bridge } from '@/lib/bridge';

/** Çalışan görevin iptal durumu ve uçuştaki istekler. */
class TaskControl {
  private cancelled = false;
  private requests = new Set<string>();

  reset(): void {
    this.cancelled = false;
    this.requests.clear();
  }

  cancel(): void {
    this.cancelled = true;
    for (const requestId of this.requests) {
      void bridge.providers.cancel(requestId).catch(() => undefined);
    }
    this.requests.clear();
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  track(requestId: string): void {
    this.requests.add(requestId);
  }

  untrack(requestId: string): void {
    this.requests.delete(requestId);
  }
}

export const taskControl = new TaskControl();
