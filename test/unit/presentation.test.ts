import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DiagnosticsBatch,
  DiagnosticsEvent,
  DiagnosticsSnapshot,
} from "@setu-ts/common";
import { Capture } from "../../src/model/capture";
import { presentation } from "../../src/model/presentation";

const snapshot: DiagnosticsSnapshot = {
  version: 1,
  instanceId: "instance",
  state: "running",
  failureCode: null,
  nodes: [
    {
      id: "p1",
      kind: "plugin",
      label: "<script>alert(1)</script>",
      version: "1",
    },
    { id: "r1", kind: "route", method: "GET" },
  ],
  edges: [{ from: "p1", to: "r1", kind: "provides" }],
  truncated: true,
  droppedEvents: 3,
};
const event: DiagnosticsEvent = {
  sequence: 1,
  operationId: "op1",
  parentOperationId: "missing",
  kind: "request",
  stage: "request",
  nodeId: "missing",
  outcome: "ok",
  atMs: null,
  durationMs: null,
};
function batch(events: DiagnosticsEvent[]): DiagnosticsBatch {
  return {
    version: 1,
    instanceId: "instance",
    events,
    next: events.at(-1)?.sequence ?? 0,
    lost: 0,
    closed: false,
  };
}

test("presentation creates owned bounded display records and keeps partial capture explicit", () => {
  const capture = new Capture();
  capture.setSnapshot(snapshot);
  capture.append(batch([event]), capture.revision);
  const model = presentation(capture);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.nodes));
  assert.equal(model.nodes[0]?.label, "<script>alert(1)</script>");
  assert.equal(model.events[0]?.unresolvedParent, true);
  assert.equal(model.events[0]?.unresolvedNode, true);
  assert.equal(model.events[0]?.atMs, null);
  assert.deepEqual(model.quality, {
    frameworkLost: 0,
    collectorDropped: 3,
    hostEvicted: 0,
    snapshotTruncated: true,
    clippedNodes: 0,
    clippedEdges: 0,
    clippedEvents: 0,
  });
});

test("presentation applies literal filters and pages without recursive graph traversal", () => {
  const capture = new Capture();
  capture.setSnapshot({
    ...snapshot,
    nodes: Array.from({ length: 102 }, (_, index) => ({
      id: `p${index}`,
      kind: "plugin" as const,
      label: index === 101 ? "needle" : "ordinary",
    })),
    edges: Array.from({ length: 300 }, (_, index) => ({
      from: `p${index % 102}`,
      to: `p${(index + 1) % 102}`,
      kind: "provides" as const,
    })),
  });
  const first = presentation(capture);
  assert.equal(first.nodes.length, 100);
  assert.equal(first.quality.clippedNodes, 2);
  assert.equal(first.edges.length, 200);
  const filtered = presentation(capture, { filter: "needle" });
  assert.equal(filtered.nodes.length, 1);
  assert.equal(filtered.nodes[0]?.id, "p101");
  assert.equal(presentation(capture, { filter: "[" }).nodes.length, 0);
});

test("presentation clips labels, exposes node details and handles an empty capture", () => {
  const capture = new Capture();
  assert.equal(presentation(capture).state, null);
  capture.setSnapshot({
    ...snapshot,
    nodes: [
      { id: "c1", kind: "capability", registered: false },
      {
        id: "m1",
        kind: "middleware",
        priority: 2,
        position: 4,
        label: "x".repeat(200),
      },
    ],
  });
  assert.equal(presentation(capture, { nodePage: 1 }).nodes.length, 0);
  const model = presentation(capture);
  assert.equal(model.nodes[0]?.registered, false);
  assert.equal(model.nodes[1]?.detail, "2 · 4");
  assert.match(model.nodes[1]?.label ?? "", /…$/);
});
