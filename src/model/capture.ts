import type {
  DiagnosticsSnapshot,
  DiagnosticsEvent,
  DiagnosticsBatch,
} from "@setu-ts/common";
const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
export class Capture {
  snapshot: DiagnosticsSnapshot | undefined;
  readonly events: DiagnosticsEvent[] = [];
  cursor = 0;
  revision = 0;
  lost = 0;
  evicted = 0;
  private bytes = 0;
  readonly sizes: number[] = [];
  setSnapshot(value: DiagnosticsSnapshot): void {
    this.snapshot = value;
  }
  append(batch: DiagnosticsBatch, revision: number): void {
    this.cursor = batch.next;
    this.lost = add(this.lost, batch.lost);
    if (revision !== this.revision) return;
    for (const event of batch.events) {
      const size = Buffer.byteLength(JSON.stringify(event));
      this.events.push(event);
      this.sizes.push(size);
      this.bytes += size;
    }
    while (this.events.length > 4096 || this.bytes > 4 * 1024 * 1024) {
      this.events.shift();
      this.bytes -= this.sizes.shift()!;
      this.evicted = add(this.evicted, 1);
    }
  }
  clear(): void {
    this.revision++;
    this.events.length = 0;
    this.sizes.length = 0;
    this.bytes = 0;
    this.lost = 0;
    this.evicted = 0;
  }
  reset(): void {
    this.clear();
    this.snapshot = undefined;
    this.cursor = 0;
  }
}
