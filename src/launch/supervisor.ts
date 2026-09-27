/** Packaged Linux group leader. It never receives credentials through IPC. */
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  liveMembers,
  processIdentity,
  terminateUnknownGroup,
} from "./process-group";
function send(value: object): void {
  if (process.connected) process.send?.(value, () => {});
}
let stopping = false,
  started = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    process.kill(0, "SIGTERM");
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      if (
        (await liveMembers(process.pid, process.pid)).every(
          (pid) => pid === process.pid,
        )
      ) {
        if (process.connected)
          await new Promise<void>((resolve) =>
            process.send?.({ kind: "clean" }, () => resolve()),
          );
        process.exit(0);
      }
      await delay(50);
    }
    if (process.connected)
      await new Promise<void>((resolve) =>
        process.send?.({ kind: "escalating" }, () => resolve()),
      );
    process.kill(0, "SIGKILL");
  } catch {
    try {
      send({ kind: "unknown" });
    } finally {
      terminateUnknownGroup(
        (pid, signal) => process.kill(pid, signal),
        (code) => process.exit(code),
      );
    }
  }
}
const own = await processIdentity(process.pid);
if (own.group !== process.pid || own.session !== process.pid || !process.send)
  process.exit(1);
process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
process.on("disconnect", () => {
  void stop();
});
const startupTimer = setTimeout(() => {
  void stop();
}, 5000);
process.on("message", (raw: unknown) => {
  if (stopping) return;
  try {
    if (
      typeof raw !== "object" ||
      raw === null ||
      Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024
    )
      throw new Error();
    const value = raw as Record<string, unknown>;
    if (value.kind === "stop" && Object.keys(value).length === 1) {
      void stop();
      return;
    }
    if (value.kind !== "start" || started || Object.keys(value).length !== 5)
      throw new Error();
    if (
      typeof value.executable !== "string" ||
      !isAbsolute(value.executable) ||
      typeof value.cwd !== "string" ||
      !isAbsolute(value.cwd) ||
      !(
        value.member === null ||
        (typeof value.member === "string" &&
          /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.member))
      )
    )
      throw new Error();
    if (
      typeof value.env !== "object" ||
      value.env === null ||
      Array.isArray(value.env)
    )
      throw new Error();
    const env: Record<string, string> = {};
    for (const [key, item] of Object.entries(value.env)) {
      if (
        typeof item !== "string" ||
        key.startsWith("SETU_DEVTOOL_") ||
        [
          "NODE_CHANNEL_FD",
          "NODE_CHANNEL_SERIALIZATION_MODE",
          "NODE_OPTIONS",
          "NODE_PATH",
          "ELECTRON_RUN_AS_NODE",
        ].includes(key) ||
        key.startsWith("VSCODE_")
      )
        throw new Error();
      env[key] = item;
    }
    const id = process.env.SETU_DEVTOOL_SESSION_ID,
      key = process.env.SETU_DEVTOOL_SESSION_KEY;
    if (
      !id ||
      !/^[a-f0-9]{32}$/.test(id) ||
      !key ||
      !/^[a-f0-9]{64}$/.test(key)
    )
      throw new Error();
    env.SETU_DEVTOOL_SESSION_ID = id;
    env.SETU_DEVTOOL_SESSION_KEY = key;
    if (value.member !== null) env.SETU_DEVTOOL_MEMBER = value.member;
    started = true;
    clearTimeout(startupTimer);
    const child = spawn(value.executable, ["task", "dev"], {
      cwd: value.cwd,
      env,
      shell: false,
      stdio: "ignore",
    });
    delete process.env.SETU_DEVTOOL_SESSION_ID;
    delete process.env.SETU_DEVTOOL_SESSION_KEY;
    child.once("spawn", () => send({ kind: "started" }));
    child.once("error", () => {
      send({ kind: "root-exit", code: null });
      void stop();
    });
    child.once("exit", (code) => {
      send({ kind: "root-exit", code });
      void stop();
    });
  } catch {
    void stop();
  }
});
send({ kind: "ready", identity: own });
