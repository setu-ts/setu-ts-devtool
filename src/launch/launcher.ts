import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { LaunchDescriptor } from "./preflight";
import type { Executable } from "./executable";
import { applicationEnvironment } from "./credentials";
import {
  liveMembers,
  processIdentity,
  type ProcessIdentity,
} from "./process-group";
export interface OwnedLaunch {
  readonly exited: Promise<number | null>;
  stop(): Promise<boolean>;
  recheck(): Promise<boolean>;
}
export interface LauncherHost {
  spawn: typeof spawn;
  identity: typeof processIdentity;
  members: typeof liveMembers;
}
const systemHost: LauncherHost = {
  spawn,
  identity: processIdentity,
  members: liveMembers,
};
export async function launchOwned(
  descriptor: LaunchDescriptor,
  executable: Executable,
  supervisor: string,
  id: string,
  encoded: string,
  signal: AbortSignal,
  host: LauncherHost = systemHost,
): Promise<OwnedLaunch> {
  signal.throwIfAborted();
  const child = host.spawn(process.execPath, [supervisor], {
    detached: true,
    shell: false,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      ...(process.env.NODE_V8_COVERAGE
        ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
        : {}),
      SETU_DEVTOOL_SESSION_ID: id,
      SETU_DEVTOOL_SESSION_KEY: encoded,
    },
  });
  let identity: ProcessIdentity | undefined,
    clean = false,
    escalating = false,
    ended = false,
    stopping: Promise<boolean> | undefined;
  let exitRoot: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((resolve) => {
    exitRoot = resolve;
  });
  const exitedSupervisor = new Promise<void>((resolve) => {
    child.once("exit", () => {
      ended = true;
      exitRoot(null);
      resolve();
    });
    child.once("error", () => {
      ended = true;
      exitRoot(null);
      resolve();
    });
  });
  const send = (value: object) => {
    if (child.connected) child.send(value, () => {});
  };
  const recheck = async () => {
    if (!identity) return ended;
    try {
      return (
        (await host.members(identity.group, identity.session)).length === 0
      );
    } catch {
      return false;
    }
  };
  const stop = (): Promise<boolean> =>
    (stopping ??= (async () => {
      send({ kind: "stop" });
      const waitAbort = new AbortController();
      await Promise.race([
        exitedSupervisor,
        delay(7500, undefined, { signal: waitAbort.signal }).catch(() => {}),
      ]);
      waitAbort.abort();
      if (!ended) {
        child.disconnect();
        return false;
      }
      if (!clean && !escalating) return false;
      const deadline = performance.now() + 2000;
      do {
        if (await recheck()) return true;
        await delay(50);
      } while (performance.now() < deadline);
      return false;
    })());
  const abort = () => {
    void stop();
  };
  signal.addEventListener("abort", abort, { once: true });
  child.on("message", (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return;
    const value = raw as Record<string, unknown>;
    if (value.kind === "root-exit")
      exitRoot(typeof value.code === "number" ? value.code : null);
    if (value.kind === "clean") clean = true;
    if (value.kind === "escalating") escalating = true;
  });
  try {
    const message = await receive(child, "ready", signal);
    if (!child.pid) throw new Error();
    identity = await host.identity(child.pid);
    if (
      identity.group !== child.pid ||
      identity.session !== child.pid ||
      JSON.stringify(message.identity) !== JSON.stringify(identity)
    )
      throw new Error();
    const messageToSend = {
      kind: "start",
      executable: executable.path,
      cwd: descriptor.root,
      member: descriptor.member,
      env: applicationEnvironment(executable.pathValue),
    };
    if (Buffer.byteLength(JSON.stringify(messageToSend)) > 1024 * 1024)
      throw new Error("LAUNCH_FAILED");
    const started = receive(child, "started", signal);
    send(messageToSend);
    await started;
    return {
      exited,
      stop: async () => {
        signal.removeEventListener("abort", abort);
        return stop();
      },
      recheck,
    };
  } catch {
    signal.removeEventListener("abort", abort);
    const safe = await stop();
    throw Object.assign(
      new Error(safe ? "LAUNCH_FAILED" : "CLEANUP_REQUIRED"),
      { owned: { exited, stop, recheck } },
    );
  }
}
function receive(
  child: ChildProcess,
  kind: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", message);
      child.off("exit", fail);
      child.off("error", fail);
      signal.removeEventListener("abort", fail);
    };
    const fail = () => {
      cleanup();
      reject(new Error("LAUNCH_FAILED"));
    };
    const message = (raw: unknown) => {
      if (
        typeof raw === "object" &&
        raw !== null &&
        "kind" in raw &&
        raw.kind === kind
      ) {
        cleanup();
        resolve(raw as Record<string, unknown>);
      }
    };
    const timer = setTimeout(fail, 5000);
    child.on("message", message);
    child.once("exit", fail);
    child.once("error", fail);
    signal.addEventListener("abort", fail, { once: true });
    if (signal.aborted) fail();
  });
}
