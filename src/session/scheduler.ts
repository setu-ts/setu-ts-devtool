import { setTimeout as delay } from "node:timers/promises";
/** Completion-based scheduling never queues ticks behind an outstanding call. */
export async function schedule(
  signal: AbortSignal,
  read: () => Promise<void>,
  snapshot: () => Promise<void>,
): Promise<void> {
  let refreshed = performance.now();
  while (!signal.aborted) {
    await delay(250, undefined, { signal });
    if (performance.now() - refreshed >= 5000) {
      await snapshot();
      refreshed = performance.now();
    } else await read();
  }
}
