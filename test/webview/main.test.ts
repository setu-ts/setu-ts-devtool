import { test } from "node:test";
import assert from "node:assert/strict";

class Element {
  textContent = "";
  className = "";
  tabIndex = 0;
  type = "";
  placeholder = "";
  value = "";
  readonly children: Element[] = [];
  readonly listeners = new Map<string, () => void>();
  append(...values: Element[]): void {
    this.children.push(...values);
  }
  replaceChildren(...values: Element[]): void {
    this.children.length = 0;
    this.children.push(...values);
  }
  addEventListener(kind: string, listener: () => void): void {
    this.listeners.set(kind, listener);
  }
  setAttribute(_name: string, _value: string): void {}
}

test("webview renders host frames through text nodes and acknowledges them", async () => {
  const root = new Element(),
    messages: unknown[] = [];
  let receive: ((event: { data: unknown }) => void) | undefined;
  const globals = globalThis as unknown as {
    document: {
      getElementById(id: string): Element | null;
      createElement(name: string): Element;
    };
    window: {
      addEventListener(
        kind: string,
        listener: (event: { data: unknown }) => void,
      ): void;
    };
    acquireVsCodeApi(): { postMessage(value: unknown): void };
  };
  globals.document = {
    getElementById: (id) => (id === "app" ? root : null),
    createElement: () => new Element(),
  };
  globals.window = {
    addEventListener: (kind, listener) => {
      if (kind === "message") receive = listener;
    },
  };
  globals.acquireVsCodeApi = () => ({
    postMessage: (value) => messages.push(value),
  });
  await import("../../webview/main.ts");
  assert.deepEqual(messages[0], { kind: "ready", version: 1, generation: "" });
  receive?.({
    data: {
      kind: "frame",
      version: 1,
      generation: "panel",
      frame: 3,
      revision: 0,
      selected: null,
      model: {
        state: null,
        nodes: [{ id: "p1", kind: "plugin", label: null, detail: "detail" }],
        edges: [],
        events: [
          {
            id: "e1",
            sequence: 1,
            kind: "request",
            stage: "handler",
            operationId: "op1",
            outcome: "ok",
            durationMs: null,
            unresolvedParent: true,
            unresolvedNode: false,
          },
        ],
        quality: {
          frameworkLost: 0,
          collectorDropped: 0,
          hostEvicted: 0,
          snapshotTruncated: false,
          clippedNodes: 0,
          clippedEdges: 0,
          clippedEvents: 0,
        },
      },
    },
  });
  assert.equal(root.children[0]?.textContent, "Setu-TS Inspection");
  assert.equal(
    root.children[4]?.children[1]?.children[0]?.children[0]?.textContent,
    "plugin p1 — detail",
  );
  assert.deepEqual(messages.at(-1), {
    kind: "acknowledge",
    version: 1,
    generation: "panel",
    frame: 3,
  });
  root.children[2]?.children[0]?.listeners.get("click")?.();
  root.children[2]?.children[1]?.listeners.get("click")?.();
  assert.equal((messages.at(-2) as { kind: string }).kind, "clear");
  assert.equal((messages.at(-1) as { kind: string }).kind, "stop");
  const filter = root.children[2]?.children[2] as Element;
  filter.value = "plugin";
  filter.listeners.get("change")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "filter");
  root.children[4]?.children[1]?.children[0]?.children[0]?.listeners.get(
    "click",
  )?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "select");
  root.children[6]?.children[1]?.listeners.get("click")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "documentation");
  receive?.({ data: { kind: "not-a-frame" } });
  receive?.({
    data: {
      kind: "frame",
      version: 1,
      generation: "panel",
      frame: 4,
      revision: 1,
      selected: "e2",
      model: {
        state: "running",
        nodes: [{ id: "p2", kind: "route", label: "label", detail: null }],
        edges: [],
        events: [
          {
            id: "e2",
            sequence: 2,
            kind: "request",
            stage: "request",
            operationId: "op2",
            outcome: "ok",
            durationMs: 4,
            unresolvedParent: false,
            unresolvedNode: false,
          },
        ],
        quality: {
          frameworkLost: 1,
          collectorDropped: 2,
          hostEvicted: 3,
          snapshotTruncated: true,
          clippedNodes: 1,
          clippedEdges: 2,
          clippedEvents: 3,
        },
      },
    },
  });
  assert.match(root.children[3]?.textContent ?? "", /snapshot truncated yes/);
  receive?.({
    data: {
      kind: "frame",
      version: 1,
      generation: "panel",
      frame: 5,
      revision: 2,
      selected: "p2",
      model: {
        state: "running",
        nodes: [{ id: "p2", kind: "route", label: "label", detail: null }],
        edges: [{ from: "p2", to: "p2", kind: "depends-on" }],
        events: [],
        quality: {
          frameworkLost: 0,
          collectorDropped: 0,
          hostEvicted: 0,
          snapshotTruncated: false,
          clippedNodes: 0,
          clippedEdges: 0,
          clippedEvents: 0,
        },
      },
    },
  });
  assert.equal(
    root.children[4]?.children[1]?.children[0]?.children[0]?.className,
    "selected",
  );
  assert.match(root.children[4]?.children[2]?.textContent ?? "", /depends-on/);
});
