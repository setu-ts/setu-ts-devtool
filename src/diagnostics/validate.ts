import type {
  DiagnosticsSnapshot,
  DiagnosticsBatch,
  DiagnosticsNode,
  DiagnosticsEvent,
} from "@setu-ts/common";
import type { DiagnosticsSessionLifetime } from "@setu-ts/diagnostics-plugin";
/** The pinned public client validates wire DTOs. This boundary owns a minimal copy. */
function node(value: DiagnosticsNode): DiagnosticsNode {
  return Object.freeze({
    id: value.id,
    kind: value.kind,
    ...(value.label === undefined ? {} : { label: value.label }),
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.method === undefined ? {} : { method: value.method }),
    ...(value.priority === undefined ? {} : { priority: value.priority }),
    ...(value.position === undefined ? {} : { position: value.position }),
    ...(value.registered === undefined ? {} : { registered: value.registered }),
  });
}
function event(value: DiagnosticsEvent): DiagnosticsEvent {
  return Object.freeze({
    sequence: value.sequence,
    operationId: value.operationId,
    parentOperationId: value.parentOperationId,
    kind: value.kind,
    stage: value.stage,
    nodeId: value.nodeId,
    outcome: value.outcome,
    atMs: value.atMs,
    durationMs: value.durationMs,
    ...(value.statusCode === undefined ? {} : { statusCode: value.statusCode }),
    ...(value.traceId === undefined ? {} : { traceId: value.traceId }),
    ...(value.spanId === undefined ? {} : { spanId: value.spanId }),
  });
}
export function snapshotProjection(
  value: DiagnosticsSnapshot,
  instance: string | null,
): DiagnosticsSnapshot {
  if (
    !value.instanceId ||
    (instance !== null && value.instanceId !== instance) ||
    value.nodes.length > 1024 ||
    value.edges.length > 4096 ||
    Buffer.byteLength(JSON.stringify(value)) > 256 * 1024
  )
    throw new Error("CONNECTION_FAILED");
  return Object.freeze({
    version: 1,
    instanceId: value.instanceId,
    state: value.state,
    failureCode: value.failureCode,
    nodes: Object.freeze(value.nodes.map(node)),
    edges: Object.freeze(
      value.edges.map((edge) =>
        Object.freeze({ from: edge.from, to: edge.to, kind: edge.kind }),
      ),
    ),
    truncated: value.truncated,
    droppedEvents: value.droppedEvents,
  });
}
export function batchProjection(
  value: DiagnosticsBatch,
  instance: string,
  after: number,
): DiagnosticsBatch {
  if (
    value.instanceId !== instance ||
    value.events.length > 128 ||
    value.events.some((e) => Buffer.byteLength(JSON.stringify(e)) > 1024) ||
    (!value.events.length
      ? value.next !== after || value.lost !== 0
      : value.events[0]!.sequence <= after ||
        value.lost !== value.events[0]!.sequence - after - 1 ||
        value.next !== value.events.at(-1)!.sequence)
  )
    throw new Error("CONNECTION_FAILED");
  return Object.freeze({
    version: 1,
    instanceId: instance,
    events: Object.freeze(value.events.map(event)),
    next: value.next,
    lost: value.lost,
    closed: value.closed,
  });
}
/** At most the framework's maximum `ttlMs` and its renewable ceiling. */
const MAX_WINDOW_MS = 3_600_000;
const MAX_LIFETIME_MS = 43_200_000;
const bounded = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max;
export function lifetimeProjection(
  value: DiagnosticsSessionLifetime,
): DiagnosticsSessionLifetime {
  const keys = Object.keys(value).sort().join();
  const renewal: unknown = value.renewal;
  if (
    keys !== "expiresInMs,renewal" ||
    !bounded(value.expiresInMs, 0, MAX_WINDOW_MS) ||
    (renewal !== null &&
      (typeof renewal !== "object" ||
        Object.keys(renewal).join() !== "maxRemainingMs" ||
        !bounded(
          (renewal as { maxRemainingMs: unknown }).maxRemainingMs,
          value.expiresInMs,
          MAX_LIFETIME_MS,
        )))
  )
    throw new Error("CONNECTION_FAILED");
  return Object.freeze({
    expiresInMs: value.expiresInMs,
    renewal:
      value.renewal === null
        ? null
        : Object.freeze({ maxRemainingMs: value.renewal.maxRemainingMs }),
  });
}
