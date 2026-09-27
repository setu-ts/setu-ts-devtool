import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DiagnosticsSnapshot,
  DiagnosticsBatch,
  DiagnosticsEvent,
} from "@setu-ts/common";
import { Capture } from "../../src/model/capture";
import {
  snapshotProjection,
  batchProjection,
} from "../../src/diagnostics/validate";
export const snapshot: DiagnosticsSnapshot = {
  version: 1,
  instanceId: "instance",
  state: "running",
  failureCode: null,
  nodes: [],
  edges: [],
  truncated: false,
  droppedEvents: 0,
};
const event: DiagnosticsEvent = {
  sequence: 1,
  operationId: "op1",
  parentOperationId: null,
  kind: "request",
  stage: "request",
  nodeId: null,
  outcome: "ok",
  atMs: 0,
  durationMs: 1,
};
const batch = (events: DiagnosticsEvent[], after = 0): DiagnosticsBatch => ({
  version: 1,
  instanceId: "instance",
  events,
  next: events.at(-1)?.sequence ?? after,
  lost: events.length ? events[0]!.sequence - after - 1 : 0,
  closed: false,
});
test("capture bounds retention, accounts gaps, Clear preserves cursor and drops in-flight events", () => {
  const store = new Capture();
  store.setSnapshot(snapshot);
  store.append(
    batch(
      Array.from({ length: 4200 }, (_, i) => ({ ...event, sequence: i + 1 })),
    ),
    0,
  );
  assert.equal(store.events.length, 4096);
  assert.equal(store.evicted, 104);
  assert.equal(store.cursor, 4200);
  const revision = store.revision;
  store.clear();
  store.append(batch([{ ...event, sequence: 4210 }], 4200), revision);
  assert.equal(store.events.length, 0);
  assert.equal(store.cursor, 4210);
  assert.equal(store.lost, 9);
  assert.equal(store.snapshot, snapshot);
  store.append(batch([{ ...event, sequence: 4211 }], 4210), store.revision);
  assert.equal(store.events.length, 1);
  store.reset();
  assert.equal(store.cursor, 0);
  assert.equal(store.snapshot, undefined);
});
test("allowlisted projections own frozen copies and enforce the adapter identity/budgets", () => {
  const full: DiagnosticsSnapshot = {
    ...snapshot,
    nodes: [
      { id: "p1", kind: "plugin", label: "name", version: "1.0.0" },
      { id: "r1", kind: "route", method: "GET" },
      { id: "m1", kind: "middleware", priority: -1, position: 1 },
      { id: "c1", kind: "capability", registered: true },
    ],
    edges: [{ from: "p1", to: "c1", kind: "provides" }],
  };
  const result = snapshotProjection(full, null);
  assert.ok(Object.isFrozen(result.nodes[0]));
  assert.notEqual(result.nodes, full.nodes);
  assert.throws(() =>
    snapshotProjection({ ...snapshot, instanceId: null }, null),
  );
  assert.throws(() => snapshotProjection(snapshot, "other"));
  assert.throws(() =>
    snapshotProjection(
      { ...snapshot, nodes: Array(1025).fill(full.nodes[0]) },
      null,
    ),
  );
  assert.throws(() =>
    snapshotProjection(
      { ...snapshot, edges: Array(4097).fill(full.edges[0]) },
      null,
    ),
  );
  const projected = batchProjection(
    batch([
      {
        ...event,
        statusCode: 200,
        traceId: "1".repeat(32),
        spanId: "1".repeat(16),
      },
    ]),
    "instance",
    0,
  );
  assert.ok(Object.isFrozen(projected.events[0]));
  assert.equal(batchProjection(batch([], 5), "instance", 5).next, 5);
  assert.throws(() => batchProjection(batch([event]), "other", 0));
  assert.throws(() =>
    batchProjection({ ...batch([]), next: 1 }, "instance", 0),
  );
  assert.throws(() => batchProjection(batch([event]), "instance", 1));
  assert.throws(() =>
    batchProjection({ ...batch([event]), lost: 10 }, "instance", 0),
  );
  assert.throws(() =>
    batchProjection({ ...batch([event]), next: 10 }, "instance", 0),
  );
  assert.throws(() =>
    batchProjection(batch(Array(129).fill(event)), "instance", 0),
  );
  assert.throws(() =>
    batchProjection(
      batch([{ ...event, operationId: "x".repeat(1025) }]),
      "instance",
      0,
    ),
  );
});
