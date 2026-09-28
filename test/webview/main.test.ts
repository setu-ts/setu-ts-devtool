import { test } from "node:test";
import assert from "node:assert/strict";

class Element {
  textContent = "";
  className = "";
  tabIndex = 0;
  type = "";
  placeholder = "";
  value = "";
  disabled = false;
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
  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
  }
}

function frame(overrides: Record<string, unknown> = {}) {
  return {
    kind: "frame",
    version: 1,
    generation: "panel",
    frame: 3,
    revision: 0,
    selected: null,
    sample: false,
    model: {
      state: null,
      failureCode: null,
      nodes: [
        {
          id: "p1",
          kind: "plugin",
          label: null,
          detail: "detail",
          registered: null,
        },
      ],
      edges: [],
      events: [
        {
          id: "e1",
          sequence: 1,
          operationId: "op1",
          parentOperationId: null,
          kind: "request",
          stage: "handler",
          nodeId: "p1",
          outcome: "ok",
          atMs: null,
          durationMs: null,
          statusCode: null,
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
      page: { filter: "", node: 0, nodes: 1, event: 0, events: 1 },
    },
    ...overrides,
  };
}

test("webview renders bounded graph/timeline controls through text nodes", async () => {
  const root = new Element(),
    messages: unknown[] = [];
  let receive: ((event: { data: unknown }) => void) | undefined;
  const globals = globalThis as unknown as {
    document: {
      getElementById(id: string): Element | null;
      createElement(name: string): Element;
      createElementNS(namespace: string, name: string): Element;
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
    createElementNS: () => new Element(),
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
  receive?.({ data: frame() });
  assert.equal(root.children[0]?.textContent, "Setu-TS Inspection");
  assert.equal(root.children[4]?.children[1]?.className, "topology");
  assert.equal(
    root.children[4]?.children[2]?.children[0]?.children[0]?.textContent,
    "plugin p1 — detail",
  );
  assert.deepEqual(messages.at(-1), {
    kind: "acknowledge",
    version: 1,
    generation: "panel",
    frame: 3,
  });
  const filter = root.children[2]?.children[2] as Element;
  filter.value = "plugin";
  filter.listeners.get("input")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "filter");
  root.children[4]?.children[2]?.children[0]?.children[0]?.listeners.get(
    "click",
  )?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "select");
  root.children[5]?.children[1]?.children[0]?.children[0]?.listeners.get(
    "click",
  )?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "select");
  root.children[7]?.children[1]?.listeners.get("click")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "documentation");
  receive?.({
    data: frame({
      sample: true,
      selected: "p1",
      model: {
        ...frame().model,
        state: "running",
        failureCode: "startup-failed",
        edges: [{ from: "p1", to: "p1", kind: "depends-on" }],
        page: { filter: "plugin", node: 1, nodes: 2, event: 0, events: 2 },
      },
    }),
  });
  assert.equal(
    root.children[1]?.textContent,
    "Sample data — no live connection",
  );
  assert.match(root.children[2]?.textContent ?? "", /startup-failed/);
  assert.match(root.children[5]?.children[3]?.textContent ?? "", /depends-on/);
  assert.match(
    root.children[7]?.children[1]?.textContent ?? "",
    /registered unknown/,
  );
  root.children[5]?.children[4]?.children[0]?.listeners.get("click")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "filter");
  receive?.({
    data: frame({
      frame: 5,
      selected: "e1",
      model: {
        ...frame().model,
        nodes: [],
        edges: [{ from: "missing", to: "p1", kind: "provides" }],
        events: [
          {
            ...frame().model.events[0],
            parentOperationId: "op0",
            nodeId: "p1",
            atMs: 10,
            durationMs: 4,
            statusCode: 200,
            unresolvedParent: false,
            unresolvedNode: false,
          },
        ],
        page: { filter: "plugin", node: 0, nodes: 1, event: 0, events: 2 },
      },
    }),
  });
  assert.match(
    root.children[6]?.children[1]?.textContent ?? "",
    /operation op1/,
  );
  root.children[5]?.children[2]?.children[2]?.listeners.get("click")?.();
  assert.equal((messages.at(-1) as { kind: string }).kind, "filter");
  receive?.({
    data: frame({
      frame: 6,
      model: {
        ...frame().model,
        nodes: [],
        events: [],
        page: { filter: "", node: 0, nodes: 1, event: 0, events: 1 },
      },
    }),
  });
  assert.match(
    root.children[6]?.children[1]?.textContent ?? "",
    /Select a graph node/,
  );
  receive?.({
    data: frame({
      frame: 7,
      selected: "p2",
      model: {
        ...frame().model,
        nodes: [
          {
            id: "p2",
            kind: "route",
            label: "label",
            detail: null,
            registered: false,
          },
        ],
        events: [],
      },
    }),
  });
  assert.match(
    root.children[6]?.children[1]?.textContent ?? "",
    /registered false/,
  );
  receive?.({ data: frame({ frame: 8, selected: "e1" }) });
  assert.match(root.children[6]?.children[1]?.textContent ?? "", /parent none/);
});
