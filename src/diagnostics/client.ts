import { createDiagnosticsClient } from "@setu-ts/diagnostics-plugin";
import type { DiagnosticsSnapshot, DiagnosticsBatch } from "@setu-ts/common";
import { loopbackTransport } from "./transport";
import { snapshotProjection, batchProjection } from "./validate";
export interface CoreClient {
  snapshot(): Promise<DiagnosticsSnapshot>;
  read(after: number): Promise<DiagnosticsBatch>;
  close(): void;
}
export function coreClient(
  port: number,
  id: string,
  key: Uint8Array,
  signal: AbortSignal,
): CoreClient {
  const transport = loopbackTransport(port, signal);
  const client = createDiagnosticsClient({
    endpoint: `http://127.0.0.1:${port}`,
    sessionId: id,
    sessionKey: key,
    subtle: crypto.subtle,
    fetch: transport.fetch,
    timing: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  });
  let instance: string | null = null;
  return {
    async snapshot() {
      const result = snapshotProjection(await client.snapshot(), instance);
      instance = result.instanceId;
      return result;
    },
    async read(after) {
      if (instance === null) throw new Error("CONNECTION_FAILED");
      return batchProjection(await client.read(after, 128), instance, after);
    },
    close() {
      transport.close();
      client.close();
    },
  };
}
