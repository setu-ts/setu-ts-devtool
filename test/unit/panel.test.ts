import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { DiagnosticsEvent, DiagnosticsSnapshot } from "@setu-ts/common";
import type * as VSCode from "vscode";
import { Capture } from "../../src/model/capture";
import { InspectionPanel } from "../../src/presentation/panel";
import * as editor from "../fixtures/vscode";

function context(): VSCode.ExtensionContext {
  return {
    extensionUri: "extension",
    subscriptions: [],
  } as unknown as VSCode.ExtensionContext;
}
function session() {
  const capture = new Capture();
  const snapshot: DiagnosticsSnapshot = {
    version: 1,
    instanceId: "instance",
    state: "running",
    failureCode: null,
    nodes: [{ id: "p1", kind: "plugin", label: "plugin" }],
    edges: [],
    truncated: false,
    droppedEvents: 0,
  };
  capture.setSnapshot(snapshot);
  let clears = 0;
  let stops = 0;
  return {
    value: {
      get displayCapture() {
        return capture;
      },
      clear: () => {
        clears++;
        capture.clear();
      },
      stop: async () => {
        stops++;
        capture.reset();
      },
    },
    clears: () => clears,
    stops: () => stops,
  };
}
async function frame(index: number, ms = 10) {
  await delay(ms);
  return editor.panels[index]?.messages.at(-1) as {
    generation: string;
    frame: number;
  };
}

test("panel uses packaged-only CSP and accepts only current display IDs", async () => {
  const value = session();
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  panel.reveal();
  assert.match(fake.webview.html, /default-src 'none'/);
  assert.match(fake.webview.html, /connect-src 'none'/);
  assert.doesNotMatch(fake.webview.html, /command:/);
  fake.receive({ kind: "ready", version: 1, generation: "" });
  const first = await frame(index);
  assert.ok(first.generation);
  fake.receive({
    kind: "select",
    version: 1,
    generation: first.generation,
    id: "not-present",
  });
  fake.receive({
    kind: "acknowledge",
    version: 1,
    generation: first.generation,
    frame: first.frame,
  });
  panel.refresh();
  const second = await frame(index, 550);
  assert.equal(
    (fake.messages.at(-1) as { selected: string | null }).selected,
    null,
  );
  fake.receive({
    kind: "clear",
    version: 1,
    generation: second.generation,
  });
  assert.equal(value.clears(), 1);
  panel.dispose();
});

test("panel applies bounded actions, rejects stale acknowledgements and disposes safely", async () => {
  const value = session();
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  fake.visible = false;
  panel.refresh();
  fake.visible = true;
  fake.receive({ kind: "ready", version: 1, generation: "" });
  const first = await frame(index);
  fake.receive({
    kind: "acknowledge",
    version: 1,
    generation: first.generation,
    frame: first.frame + 1,
  });
  fake.receive({
    kind: "filter",
    version: 1,
    generation: first.generation,
    text: "plugin",
    eventPage: 0,
    nodePage: 0,
  });
  fake.receive({
    kind: "documentation",
    version: 1,
    generation: first.generation,
    topic: "security",
  });
  assert.match(String(editor.opened.at(-1)), /security\.md$/);
  fake.receive({
    kind: "select",
    version: 1,
    generation: first.generation,
    id: "p1",
  });
  fake.receive({
    kind: "acknowledge",
    version: 1,
    generation: first.generation,
    frame: first.frame,
  });
  const second = await frame(index, 550);
  assert.equal(
    (fake.messages.at(-1) as { selected: string | null }).selected,
    "p1",
  );
  fake.receive({ kind: "stop", version: 1, generation: second.generation });
  assert.equal(value.stops(), 1);
  fake.dispose();
  assert.equal(panel.closed, true);
  assert.deepEqual(fake.listenerCounts(), [0, 0, 0]);
  panel.reveal();
});

test("panel replaces an outstanding frame when native capture state changes", async () => {
  const value = session();
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  fake.receive({ kind: "ready", version: 1, generation: "" });
  const first = await frame(index);
  value.value.clear();
  panel.refresh();
  const replacement = await frame(index, 550);
  assert.ok(replacement.frame > first.frame);
  panel.dispose();
});

test("panel sends only dirty frames and exposes renderer readiness", async () => {
  const value = session();
  const panel = new InspectionPanel(context(), value.value, true);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  const ready = panel.waitForRenderer();
  fake.receive({ kind: "ready", version: 1, generation: "" });
  assert.equal(await ready, true);
  const first = await frame(index);
  assert.equal((fake.messages[0] as { sample: boolean }).sample, true);
  fake.receive({
    kind: "acknowledge",
    version: 1,
    generation: first.generation,
    frame: first.frame,
  });
  await delay(550);
  assert.equal(fake.messages.length, 1);
  panel.update();
  const replacement = await frame(index, 550);
  assert.ok(replacement.frame > first.frame);
  panel.dispose();
  assert.equal(await panel.waitForRenderer(), false);
});

test("panel coalesces input floods within its bounded display frame", async () => {
  const value = session();
  value.value.displayCapture.snapshot = {
    version: 1,
    instanceId: "instance",
    state: "running",
    failureCode: null,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      id: `p${index}`,
      kind: "plugin" as const,
      label: "x".repeat(5000),
    })),
    edges: [],
    truncated: false,
    droppedEvents: 0,
  };
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  fake.receive({ kind: "ready", version: 1, generation: "" });
  for (let count = 0; count < 21; count++)
    fake.receive({ kind: "unknown", version: 1, generation: "x" });
  await delay(10);
  assert.equal(fake.messages.length, 1);
  panel.dispose();
});

test("panel byte-trims a hostile but type-valid capture before posting a frame", async () => {
  const value = session();
  const capture = value.value.displayCapture;
  for (let index = 0; index < 100; index++)
    capture.events.push({
      sequence: index + 1,
      operationId: "x".repeat(5000),
      parentOperationId: null,
      kind: "request",
      stage: "request",
      nodeId: null,
      outcome: "ok",
      atMs: null,
      durationMs: null,
    } satisfies DiagnosticsEvent);
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  fake.receive({ kind: "ready", version: 1, generation: "" });
  await delay(10);
  const message = fake.messages[0] as {
    model: { quality: { clippedEvents: number } };
  };
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 256 * 1024);
  assert.ok(message.model.quality.clippedEvents > 0);
  panel.dispose();
});

test("panel clips oversized display nodes and edges before posting a frame", async () => {
  const value = session();
  value.value.displayCapture.snapshot = {
    version: 1,
    instanceId: "instance",
    state: "running",
    failureCode: null,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      id: `p${index}${"x".repeat(3000)}`,
      kind: "plugin",
      label: "plugin",
    })),
    edges: Array.from({ length: 200 }, (_, index) => ({
      from: `p${index % 100}${"x".repeat(3000)}`,
      to: `p${(index + 1) % 100}${"x".repeat(3000)}`,
      kind: "x".repeat(3000),
    })),
    truncated: false,
    droppedEvents: 0,
  } as unknown as DiagnosticsSnapshot;
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  const fake = editor.panels[index]!;
  fake.receive({ kind: "ready", version: 1, generation: "" });
  await delay(10);
  const message = fake.messages[0] as {
    model: { quality: { clippedNodes: number; clippedEdges: number } };
  };
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 256 * 1024);
  assert.ok(message.model.quality.clippedNodes > 0);
  assert.ok(message.model.quality.clippedEdges > 0);
  panel.dispose();
});

test("panel fails closed when non-page frame metadata exceeds its byte budget", async () => {
  const value = session();
  value.value.displayCapture.snapshot = {
    version: 1,
    instanceId: "instance",
    state: "x".repeat(300000),
    failureCode: null,
    nodes: [],
    edges: [],
    truncated: false,
    droppedEvents: 0,
  } as unknown as DiagnosticsSnapshot;
  const panel = new InspectionPanel(context(), value.value);
  const index = editor.panels.length - 1;
  editor.panels[index]!.receive({ kind: "ready", version: 1, generation: "" });
  await delay(10);
  assert.equal(panel.closed, true);
});
