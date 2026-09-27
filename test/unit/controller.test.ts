import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagnosticsSnapshot, DiagnosticsBatch } from "@setu-ts/common";
import {
  SessionController,
  type Prepared,
  type SessionPorts,
} from "../../src/session/controller";
const snap: DiagnosticsSnapshot = {
  version: 1,
  instanceId: "id",
  state: "running",
  failureCode: null,
  nodes: [],
  edges: [],
  truncated: false,
  droppedEvents: 0,
};
const prepared: Prepared = {
  descriptor: {
    root: "/fixture",
    directory: "/fixture",
    member: null,
    port: 4919,
    members: ["app"],
    fingerprint: "x",
  },
  executable: { path: "/deno", identity: "x", pathValue: "/bin" },
};
function harness() {
  let clean = true,
    closed = 0,
    stops = 0,
    exit: (n: number) => void = () => {};
  let tick: () => Promise<void> = async () => {},
    refresh: () => Promise<void> = async () => {};
  const exited = new Promise<number>((resolve) => {
    exit = resolve;
  });
  let batch: DiagnosticsBatch = {
    version: 1,
    instanceId: "id",
    events: [],
    next: 0,
    lost: 0,
    closed: false,
  };
  const ports: SessionPorts = {
    launch: async () => ({
      exited,
      stop: async () => {
        stops++;
        return clean;
      },
      recheck: async () => clean,
    }),
    listening: async () => false,
    ready: async () => {},
    client: () => ({
      snapshot: async () => snap,
      read: async () => batch,
      close() {
        closed++;
      },
    }),
    schedule: async (_signal, read, snapshot) => {
      tick = read;
      refresh = snapshot;
    },
  };
  const controller = new SessionController("/supervisor", () => {}, ports);
  return {
    controller,
    ports,
    setClean: (v: boolean) => {
      clean = v;
    },
    setBatch: (v: DiagnosticsBatch) => {
      batch = v;
    },
    tick: () => tick(),
    refresh: () => refresh(),
    exit: (code: number) => exit(code),
    counts: () => ({ stops, closed }),
  };
}
test("session start is explicit, serialized, stops idempotently and never retains late records", async () => {
  const h = harness();
  await h.controller.start(async () => undefined);
  assert.equal(h.controller.status().state, "Idle");
  await h.controller.start(async () => prepared);
  assert.equal(h.controller.status().state, "Live");
  assert.equal(h.controller.activeRoot, "/fixture");
  await h.controller.start(async () => {
    assert.fail("second launch");
  });
  await h.refresh();
  await h.tick();
  h.controller.clear();
  await Promise.all([h.controller.stop(), h.controller.stop()]);
  assert.equal(h.counts().stops, 1);
  assert.equal(h.controller.status().state, "Idle");
  await assert.rejects(h.refresh());
  await assert.rejects(h.tick());
  assert.equal(h.controller.status().application, null);
});
test("failed preflight and occupied ports fail without credentials or a process", async () => {
  const h = harness();
  await h.controller.start(async () => {
    throw new Error("secret");
  });
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.counts().stops, 0);
  h.ports.listening = async () => true;
  await h.controller.start(async () => prepared);
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.counts().stops, 0);
});
test("Stop cancels preparation; failed cleanup blocks launch until read-only recheck", async () => {
  const h = harness();
  let release: ((v: Prepared) => void) | undefined;
  const start = h.controller.start(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const stopped = h.controller.stop();
  await Promise.all([start, stopped]);
  assert.equal(h.counts().stops, 0);
  release?.(prepared);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.counts().stops, 0);
  assert.equal(h.controller.status().state, "Idle");
  await h.controller.start(async () => prepared);
  h.setClean(false);
  await h.controller.stop();
  assert.equal(h.controller.status().state, "Cleanup required");
  await h.controller.recheck();
  assert.equal(h.controller.status().state, "Cleanup required");
  await h.controller.stop();
  await h.controller.start(async () => {
    assert.fail();
  });
  h.setClean(true);
  await h.controller.recheck();
  assert.equal(h.controller.status().state, "Idle");
});
test("root exit, closed reader and scheduler error share the cleanup path", async () => {
  const h = harness();
  await h.controller.start(async () => prepared);
  h.exit(7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.controller.status().exitCode, 7);
  const closed = harness();
  await closed.controller.start(async () => prepared);
  closed.setBatch({
    version: 1,
    instanceId: "id",
    events: [],
    next: 0,
    lost: 0,
    closed: true,
  });
  await closed.tick();
  await closed.controller.stop();
  assert.equal(closed.controller.status().state, "Idle");
  const failure = harness();
  failure.ports.schedule = async () => {
    throw new Error("private");
  };
  await failure.controller.start(async () => prepared);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failure.controller.status().state, "Failed");
});
test("pairing failure closes client; a launch reporting uncertain ownership is retained for cleanup", async () => {
  const h = harness();
  h.ports.client = () => ({
    snapshot: async () => {
      throw new Error();
    },
    read: async () => {
      throw new Error();
    },
    close() {},
  });
  await h.controller.start(async () => prepared);
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.counts().stops, 1);
  const unknown = harness();
  unknown.ports.launch = async () => {
    throw Object.assign(new Error(), {
      owned: {
        exited: new Promise(() => {}),
        stop: async () => false,
        recheck: async () => false,
      },
    });
  };
  await unknown.controller.start(async () => prepared);
  assert.equal(unknown.controller.status().state, "Cleanup required");
});

test("local deadline stops the owned application without renewal", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  await h.controller.start(async () => prepared);
  t.mock.timers.tick(899999);
  assert.equal(h.controller.status().state, "Live");
  t.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.counts().stops, 1);
});
