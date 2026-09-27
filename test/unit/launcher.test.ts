import { test } from "node:test";
import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { credentials } from "../../src/launch/credentials";
import { launchOwned, type LauncherHost } from "../../src/launch/launcher";
const descriptor = {
    root: "/fixture",
    directory: "/fixture",
    member: null,
    port: 4919,
    members: ["test"],
    fingerprint: "x",
  },
  executable = { path: "/deno", identity: "x", pathValue: "/bin" };
function host(
  mode:
    | "good"
    | "error"
    | "identity"
    | "group"
    | "unknown"
    | "surviving"
    | "missing-pid",
): {
  host: LauncherHost;
  child: ChildProcess;
  abort: AbortController;
  invocation: unknown[];
  sent: unknown[];
} {
  const invocation: unknown[] = [],
    sent: unknown[] = [];
  const child = new ChildProcess();
  Object.defineProperty(child, "pid", {
    value: mode === "missing-pid" ? undefined : 99999,
  });
  let connected = true;
  Object.defineProperty(child, "connected", { get: () => connected });
  const identity = {
    pid: 99999,
    group: 99999,
    session: 99999,
    start: "1",
    zombie: false,
  };
  const abort = new AbortController();
  child.send = ((raw: unknown, callback: unknown) => {
    sent.push(raw);
    const message = raw as { kind: string };
    queueMicrotask(() => {
      if (message.kind === "start") child.emit("message", { kind: "started" });
      if (message.kind === "stop") {
        if (mode !== "unknown") child.emit("message", { kind: "clean" });
        connected = false;
        child.emit("exit", 0, null);
      }
      if (typeof callback === "function") callback(null);
    });
    return true;
  }) as ChildProcess["send"];
  child.disconnect = () => {
    connected = false;
  };
  const options: LauncherHost = {
    spawn: ((...args: unknown[]) => {
      invocation.push(...args);
      queueMicrotask(() => {
        if (mode === "error") child.emit("error", new Error());
        else child.emit("message", { kind: "ready", identity });
      });
      return child;
    }) as LauncherHost["spawn"],
    identity: async () => {
      if (mode === "identity") throw new Error();
      return mode === "group" ? { ...identity, group: 1 } : identity;
    },
    members: async () => {
      if (mode === "unknown") throw new Error();
      return mode === "surviving" ? [99999] : [];
    },
  };
  return { host: options, child, abort, invocation, sent };
}
test("launcher keeps unverified cleanup blocked and only performs read-only rechecks", async () => {
  for (const mode of [
    "error",
    "identity",
    "group",
    "unknown",
    "missing-pid",
  ] as const) {
    const f = host(mode);
    if (mode === "unknown") {
      const owned = await launchOwned(
        descriptor,
        executable,
        "/supervisor",
        "a",
        "b",
        f.abort.signal,
        f.host,
      );
      assert.equal(await owned.stop(), false);
      assert.equal(await owned.recheck(), false);
    } else
      await assert.rejects(
        launchOwned(
          descriptor,
          executable,
          "/supervisor",
          "a",
          "b",
          f.abort.signal,
          f.host,
        ),
      );
  }
});
test("owned handle cleans up on cancellation and root-exit metadata remains bounded", async () => {
  const f = host("good");
  const owned = await launchOwned(
    descriptor,
    executable,
    "/supervisor",
    "a",
    "b",
    f.abort.signal,
    f.host,
  );
  f.child.emit("message", null);
  f.child.emit("message", { kind: "root-exit", code: "invalid" });
  assert.equal(await owned.exited, null);
  f.abort.abort();
  assert.equal(await owned.stop(), true);
  assert.equal(await owned.recheck(), true);
});
test("surviving group cannot be reported cleaned after supervisor exit", async () => {
  const f = host("surviving");
  const owned = await launchOwned(
    descriptor,
    executable,
    "/supervisor",
    "a",
    "b",
    f.abort.signal,
    f.host,
  );
  assert.equal(await owned.stop(), false);
  assert.equal(await owned.recheck(), false);
});

test("oversized ordinary environment is rejected before sending a start descriptor", async () => {
  const f = host("good");
  process.env.SETU_TEST_LARGE_ENV = "x".repeat(1024 * 1024);
  try {
    await assert.rejects(
      launchOwned(
        descriptor,
        executable,
        "/supervisor",
        "a",
        "b",
        f.abort.signal,
        f.host,
      ),
      /LAUNCH_FAILED/,
    );
  } finally {
    delete process.env.SETU_TEST_LARGE_ENV;
  }
});

test("pairing credentials cross only the supervisor environment boundary", async () => {
  const f = host("good"),
    pair = credentials();
  const owned = await launchOwned(
    descriptor,
    executable,
    "/supervisor",
    pair.id,
    pair.encoded,
    f.abort.signal,
    f.host,
  );
  try {
    const args = JSON.stringify(f.invocation.slice(0, 2));
    assert.equal(args.includes(pair.id) || args.includes(pair.encoded), false);
    const options = f.invocation[2] as {
      env: NodeJS.ProcessEnv;
      stdio: string[];
    };
    assert.equal(options.env.SETU_DEVTOOL_SESSION_ID, pair.id);
    assert.equal(options.env.SETU_DEVTOOL_SESSION_KEY, pair.encoded);
    assert.deepEqual(options.stdio, ["ignore", "ignore", "ignore", "ipc"]);
    const ipc = JSON.stringify(f.sent);
    assert.equal(ipc.includes(pair.id) || ipc.includes(pair.encoded), false);
    assert.equal(JSON.stringify(owned).includes(pair.encoded), false);
  } finally {
    await owned.stop();
    pair.key.fill(0);
  }
});
