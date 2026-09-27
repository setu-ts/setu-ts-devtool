import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
export async function listening(
  port: number,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.destroy();
      signal.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => {
      socket.destroy();
      signal.removeEventListener("abort", abort);
      reject(new Error("CANCELLED"));
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitForListener(
  port: number,
  signal: AbortSignal,
  timeout = 60000,
): Promise<void> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeout);
  const bounded = AbortSignal.any([signal, deadline.signal]);
  try {
    while (true) {
      if (await listening(port, bounded)) return;
      await delay(250, undefined, { signal: bounded });
    }
  } finally {
    clearTimeout(timer);
  }
}
