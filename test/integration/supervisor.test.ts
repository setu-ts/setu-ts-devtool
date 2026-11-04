import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type Serializable } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { liveMembers } from "../../src/launch/process-group";
const valid = {
  kind: "start",
  executable: "/does/not/exist",
  cwd: resolve(".tmp"),
  member: null,
  env: { PATH: "/usr/bin" },
  runtime: "deno",
  npm: null,
};
const npmCli = "/opt/node/lib/node_modules/npm/bin/npm-cli.js";
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
      { ...valid, runtime: "bun" },
      { ...valid, npm: npmCli },
      { ...valid, runtime: "node", npm: null },
      {
        ...valid,
        runtime: "node",
        npm: "relative/node_modules/npm/bin/npm-cli.js",
      },
      { ...valid, runtime: "node", npm: "/opt/evil.js" },
      { ...valid, extra: true },
      { ...valid, runtime: "node", npm: npmCli },
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
test("supervisor runs node only with npm's CLI script, never another script", async () => {
  await mkdir(".tmp", { recursive: true });
  const base = await mkdtemp(resolve(".tmp/supervisor-npm-"));
  const cli = join(base, "node_modules/npm/bin/npm-cli.js");
  await mkdir(dirname(cli), { recursive: true });
  const write = (marker: string) =>
    `require("node:fs").writeFileSync(${JSON.stringify(join(base, marker))}, "ran");`;
  await writeFile(cli, write("cli-ran"));
  await writeFile(join(base, "evil.js"), write("evil-ran"));
  const send = async (npm: string) => {
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
    child.send(
      {
        ...valid,
        executable: process.execPath,
        cwd: base,
        runtime: "node",
        npm,
      },
      () => {},
    );
    await ended;
  };
  try {
    await send(join(base, "evil.js"));
    await assert.rejects(access(join(base, "evil-ran")));
    // Positive control: the same harness does observe a permitted script.
    await send(cli);
    await access(join(base, "cli-ran"));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
