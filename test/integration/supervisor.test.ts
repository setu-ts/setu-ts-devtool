import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type Serializable } from "node:child_process";
import { resolve } from "node:path";
import { once } from "node:events";
import { liveMembers } from "../../src/launch/process-group";
const valid = {
  kind: "start",
  executable: "/does/not/exist",
  cwd: resolve(".tmp"),
  member: null,
  env: { PATH: "/usr/bin" },
};
test(
  "supervisor rejects malformed control messages without starting application code",
  { timeout: 20000 },
  async () => {
    const cases: Serializable[] = [
      null as unknown as Serializable,
      {},
      { kind: "stop", extra: 1 },
      { ...valid, executable: "relative" },
      { ...valid, cwd: "relative" },
      { ...valid, member: "../escape" },
      { ...valid, env: [] },
      { ...valid, env: { KEY: 1 } },
      { ...valid, env: { SETU_DEVTOOL_SESSION_KEY: "synthetic" } },
      { ...valid, env: { NODE_CHANNEL_FD: "3" } },
      { ...valid, env: { NODE_OPTIONS: "unsafe" } },
      { ...valid, env: { VSCODE_IPC: "x" } },
      { kind: "x", payload: "x".repeat(1024 * 1024) },
      valid,
    ];
    for (const message of cases) {
      const child = spawn(process.execPath, [resolve("dist/supervisor.mjs")], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          SETU_DEVTOOL_SESSION_ID: "a".repeat(32),
          SETU_DEVTOOL_SESSION_KEY: "b".repeat(64),
          ...(process.env.NODE_V8_COVERAGE
            ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
            : {}),
        },
      });
      const ended = once(child, "exit");
      await once(child, "message");
      child.send(message, () => {});
      await ended;
      assert.ok(child.pid);
      assert.deepEqual(await liveMembers(child.pid, child.pid), []);
    }
  },
);
test("supervisor refuses missing credentials, wrong group setup, and cleans up IPC loss", async () => {
  for (const mode of ["id", "key", "ipc", "group"] as const) {
    const child = spawn(process.execPath, [resolve("dist/supervisor.mjs")], {
      detached: mode !== "group",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        SETU_DEVTOOL_SESSION_ID: mode === "id" ? "bad" : "a".repeat(32),
        SETU_DEVTOOL_SESSION_KEY: mode === "key" ? "bad" : "b".repeat(64),
        ...(process.env.NODE_V8_COVERAGE
          ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
          : {}),
      },
    });
    const ended = once(child, "exit");
    if (mode !== "group") {
      await once(child, "message");
      if (mode === "ipc") child.disconnect();
      else child.send(valid, () => {});
    }
    await ended;
  }
});
