import type {
  DiagnosticsBatch,
  DiagnosticsEvent,
  DiagnosticsSnapshot,
} from "@setu-ts/common";
import { Capture } from "../../src/model/capture";
import type { InspectionSession } from "../../src/presentation/panel";

export const sampleLabels = Object.freeze([
  "SAMPLE DATA — not connected to an application",
  "Example API · 3 plugins · 2 routes",
  "Example worker · awaiting D02 connection",
]);

const snapshot: DiagnosticsSnapshot = {
  version: 1,
  instanceId: "sample",
  state: "running",
  failureCode: null,
  nodes: [
    { id: "p1", kind: "plugin", label: "Example API", version: "1.0.0" },
    { id: "r1", kind: "route", label: "/example", method: "GET" },
    {
      id: "m1",
      kind: "middleware",
      label: "Example middleware",
      position: 1,
    },
  ],
  edges: [
    { from: "p1", to: "r1", kind: "provides" },
    { from: "m1", to: "r1", kind: "consumes" },
  ],
  truncated: false,
  droppedEvents: 0,
};
const events: readonly DiagnosticsEvent[] = [
  {
    sequence: 1,
    operationId: "op1",
    parentOperationId: null,
    kind: "request",
    stage: "request",
    nodeId: "r1",
    outcome: "ok",
    atMs: 10,
    durationMs: 6,
    statusCode: 200,
  },
];

export function sampleSession(): InspectionSession {
  const capture = new Capture();
  capture.setSnapshot(snapshot);
  const batch: DiagnosticsBatch = {
    version: 1,
    instanceId: "sample",
    events: [...events],
    next: 1,
    lost: 0,
    closed: false,
  };
  capture.append(batch, capture.revision);
  return {
    get displayCapture() {
      return capture;
    },
    clear: () => capture.clear(),
    stop: async () => capture.reset(),
  };
}
