import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagnosticsSnapshot, DiagnosticsBatch } from "@setu-ts/common";
import type { DiagnosticsSessionLifetime } from "@setu-ts/diagnostics-plugin";
import type { Renewal } from "../../src/session/scheduler";
import { planLifetime } from "../../src/session/lifetime";
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
const renewable: DiagnosticsSessionLifetime = {
  expiresInMs: 900000,
  renewal: { maxRemainingMs: 28800000 },
};
function harness() {
  let lifetime: DiagnosticsSessionLifetime = renewable;
  let clean = true,
    closed = 0,
    stops = 0,
    exit: (n: number) => void = () => {};
  let tick: () => Promise<void> = async () => {},
    refresh: () => Promise<void> = async () => {},
    renewal: Renewal | undefined,
    renewals = 0,
    renew: () => Promise<DiagnosticsSessionLifetime> = async () => renewable;
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
      session: async () => lifetime,
      renew: async () => {
        renewals++;
        return renew();
      },
      snapshot: async () => snap,
      read: async () => batch,
      close() {
        closed++;
      },
    }),
    schedule: async (_signal, read, snapshot, renewing) => {
      tick = read;
      refresh = snapshot;
      renewal = renewing;
    },
    plan: planLifetime,
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
    renewal: () => renewal!,
    renewals: () => renewals,
    setLifetime: (v: DiagnosticsSessionLifetime) => {
      lifetime = v;
    },
    setRenew: (v: () => Promise<DiagnosticsSessionLifetime>) => {
      renew = v;
    },
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
    session: async () => {
      throw new Error();
    },
    renew: async () => {
      throw new Error();
    },
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

test("the startup bound stops a launch that never pairs", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  // Like the real wait, it ends only when the session is aborted.
  h.ports.ready = (_port, signal) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new Error())),
    );
  const start = h.controller.start(async () => prepared);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(899999);
  assert.equal(h.controller.status().state, "Starting");
  t.mock.timers.tick(1);
  await start;
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.controller.status().ended, "deadline");
  assert.equal(h.counts().stops, 1);
});

const due = (sentAt: number, value: DiagnosticsSessionLifetime) => ({
  ...planLifetime(sentAt, value),
  renewAt: value.renewal ? 0 : null,
});

test("the authenticated deadline replaces the startup bound; a fixed one is never renewed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.setLifetime({ expiresInMs: 2000, renewal: null });
  h.ports.plan = due;
  await h.controller.start(async () => prepared);
  assert.equal(h.controller.status().lifetime?.renewable, false);
  assert.equal(h.renewal().due(), false);
  t.mock.timers.tick(1000);
  assert.equal(h.controller.status().state, "Live");
  t.mock.timers.tick(1000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.controller.status().ended, "deadline");
  assert.equal(h.controller.status().lifetime, null);
  assert.equal(h.renewals(), 0);
  assert.equal(h.counts().stops, 1);
  h.setLifetime(renewable);
  await h.controller.start(async () => prepared);
  assert.equal(h.controller.status().ended, null);
  await h.controller.stop();
});

test("a renewal re-arms the deadline from its own send time", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.setLifetime({ expiresInMs: 2000, renewal: { maxRemainingMs: 10000 } });
  h.setRenew(async () => ({
    expiresInMs: 2000,
    renewal: { maxRemainingMs: 8500 },
  }));
  h.ports.plan = due;
  let changes = 0;
  const controller = new SessionController(
    "/supervisor",
    () => changes++,
    h.ports,
  );
  await controller.start(async () => prepared);
  assert.equal(controller.status().lifetime?.renewable, true);
  t.mock.timers.tick(1500);
  const before = changes;
  await h.renewal().run();
  assert.equal(h.renewals(), 1);
  assert.ok(changes > before);
  // Counted down on the real clock from the renewal's send time.
  const left = controller.status().lifetime?.maxRemainingMs ?? 0;
  assert.ok(left <= 8500 && left > 8000);
  t.mock.timers.tick(1500);
  assert.equal(controller.status().state, "Live");
  t.mock.timers.tick(500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.status().state, "Failed");
  assert.equal(controller.status().ended, "deadline");
});

test("a failed renewal stops the launch once, without a retry", async () => {
  const h = harness();
  h.ports.plan = due;
  h.setRenew(async () => {
    throw new Error("refused");
  });
  h.ports.schedule = async (_signal, _read, _snapshot, renewing) => {
    assert.ok(renewing.due());
    await renewing.run();
  };
  await h.controller.start(async () => prepared);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.controller.status().state, "Failed");
  assert.equal(h.controller.status().ended, null);
  assert.equal(h.renewals(), 1);
  assert.equal(h.counts().stops, 1);
});

test("a renewal answered after Stop cannot re-arm or repopulate the session", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.ports.plan = due;
  let answer: (v: DiagnosticsSessionLifetime) => void = () => {};
  h.setRenew(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  await h.controller.start(async () => prepared);
  const pending = h.renewal().run();
  await h.controller.stop();
  answer(renewable);
  await pending;
  assert.equal(h.controller.status().state, "Idle");
  assert.equal(h.controller.status().lifetime, null);
  t.mock.timers.tick(900000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.controller.status().state, "Idle");
  assert.equal(h.controller.status().ended, null);
  await assert.rejects(h.renewal().run());
});

test("overlapping cleanup rechecks cannot erase a replacement session's ownership", async () => {
  const h = harness();
  const results: ((clean: boolean) => void)[] = [];
  let launches = 0,
    replacementStops = 0;
  h.ports.launch = async () => {
    const initial = ++launches === 1;
    return {
      exited: new Promise(() => {}),
      stop: async () => {
        if (!initial) replacementStops++;
        return !initial;
      },
      recheck: () => new Promise((resolve) => results.push(resolve)),
    };
  };
  try {
    await h.controller.start(async () => prepared);
    await h.controller.stop();
    assert.equal(h.controller.status().state, "Cleanup required");
    const first = h.controller.recheck(),
      second = h.controller.recheck();
    results[0]!(true);
    await first;
    await h.controller.start(async () => prepared);
    assert.equal(h.controller.status().state, "Live");
    // The old implementation starts a second scan: resolve it after replacement.
    // A coalesced implementation has only the first result to commit.
    results[1]?.(true);
    await second;
    assert.equal(h.controller.status().state, "Live");
    assert.equal(h.controller.activeRoot, prepared.descriptor.root);
    assert.equal(results.length, 1);
    await h.controller.stop();
    assert.equal(replacementStops, 1);
    assert.equal(h.controller.status().state, "Idle");
  } finally {
    await h.controller.stop();
  }
});

test("failed cleanup rechecks coalesce, keep launch blocked, and allow a later retry", async () => {
  const h = harness();
  let rejectScan: (error: Error) => void = () => {};
  let checks = 0;
  h.ports.launch = async () => ({
    exited: new Promise(() => {}),
    stop: async () => false,
    recheck: () => {
      checks++;
      return checks === 1
        ? new Promise<boolean>((_resolve, reject) => {
            rejectScan = reject;
          })
        : Promise.resolve(true);
    },
  });
  await h.controller.start(async () => prepared);
  await h.controller.stop();
  const first = h.controller.recheck(),
    second = h.controller.recheck();
  await h.controller.start(async () => assert.fail("cleanup still pending"));
  rejectScan(new Error("synthetic scan failure"));
  await Promise.all([first, second]);
  assert.equal(checks, 1);
  assert.equal(h.controller.status().state, "Cleanup required");
  await h.controller.recheck();
  assert.equal(checks, 2);
  assert.equal(h.controller.status().state, "Idle");
});
