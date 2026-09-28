import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { DiagnosticsSnapshot } from "@setu-ts/common";
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
  panel.reveal();
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
