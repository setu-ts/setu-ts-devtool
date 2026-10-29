import { request } from "node:http";
/** No ambient fetch/dispatcher, DNS, redirect handling or proxy environment. */
export function loopbackTransport(
  port: number,
  sessionSignal: AbortSignal,
): { fetch: typeof fetch; close(): void } {
  let closed = false;
  const active = new Set<AbortController>();
  const fetchImpl: typeof fetch = async (input, init) => {
    if (
      closed ||
      sessionSignal.aborted ||
      typeof input !== "string" ||
      init?.method !== "GET" ||
      init.body != null
    )
      throw new Error("CONNECTION_FAILED");
    const base = `http://127.0.0.1:${port}`;
    if (!input.startsWith(base + "/")) throw new Error("CONNECTION_FAILED");
    const target = input.slice(base.length);
    if (
      !/^\/v1\/(status|snapshot|renew)$/.test(target) &&
      !/^\/v1\/events\?after=(0|[1-9][0-9]*)&limit=([1-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/.test(
        target,
      )
    )
      throw new Error("CONNECTION_FAILED");
    const headers = new Headers(init.headers);
    if (
      [...headers.keys()].some(
        (key) =>
          ![
            "x-setu-session",
            "x-setu-sequence",
            "x-setu-instance",
            "x-setu-mac",
          ].includes(key),
      )
    )
      throw new Error("CONNECTION_FAILED");
    const local = new AbortController();
    active.add(local);
    const signal = AbortSignal.any([
      sessionSignal,
      local.signal,
      ...(init.signal ? [init.signal] : []),
    ]);
    return new Promise<Response>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: target,
          method: "GET",
          agent: false,
          maxHeaderSize: 8192,
          headers: Object.fromEntries(headers),
          signal,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            req.destroy();
            active.delete(local);
            reject(new Error("CONNECTION_FAILED"));
            return;
          }
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(res.headers))
            if (value !== undefined)
              responseHeaders.set(
                name,
                Array.isArray(value) ? value.join(",") : value,
              );
          const iterator = res[Symbol.asyncIterator]();
          let total = 0;
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const next: IteratorResult<unknown> = await iterator.next();
                if (next.done) {
                  active.delete(local);
                  controller.close();
                  return;
                }
                if (
                  !(next.value instanceof Uint8Array) ||
                  (total += next.value.byteLength) > 256 * 1024
                )
                  throw new Error();
                controller.enqueue(next.value);
              } catch {
                active.delete(local);
                res.destroy();
                req.destroy();
                controller.error(new Error("CONNECTION_FAILED"));
              }
            },
            cancel() {
              active.delete(local);
              res.destroy();
              req.destroy();
            },
          });
          resolve(
            new Response(stream, { status: 200, headers: responseHeaders }),
          );
        },
      );
      req.once("error", () => {
        active.delete(local);
        reject(new Error("CONNECTION_FAILED"));
      });
      req.end();
    });
  };
  return {
    fetch: fetchImpl,
    close() {
      closed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}
