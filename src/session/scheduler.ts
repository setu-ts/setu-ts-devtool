import { setTimeout as delay } from "node:timers/promises";
export interface Renewal {
  due(): boolean;
  run(): Promise<void>;
}
/**
 * Completion-based scheduling never queues ticks behind an outstanding call.
 * A due renewal takes a tick's place, so it never overlaps a read.
 */
export async function schedule(
  signal: AbortSignal,
  read: () => Promise<void>,
  snapshot: () => Promise<void>,
  renewal: Renewal,
): Promise<void> {
  let refreshed = performance.now();
  while (!signal.aborted) {
    await delay(250, undefined, { signal });
    if (renewal.due()) await renewal.run();
    else if (performance.now() - refreshed >= 5000) {
      await snapshot();
      refreshed = performance.now();
    } else await read();
  }
}
