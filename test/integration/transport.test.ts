import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, createHmac } from "node:crypto";
import { loopbackTransport } from "../../src/diagnostics/transport";
import { coreClient } from "../../src/diagnostics/client";
import { listening, waitForListener } from "../../src/launch/readiness";
import { freePort } from "../fixtures/projects";
async function server(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const value = createServer(handler);
  await new Promise<void>((resolve) => value.listen(0, "127.0.0.1", resolve));
  const address = value.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    close: async () => {
      value.closeAllConnections();
      await new Promise<void>((resolve) => value.close(() => resolve()));
    },
  };
}
test("fixed loopback transport refuses escape paths/headers and bypasses proxy settings", async () => {
  let calls = 0;
  const target = await server((_req, res) => {
    calls++;
    res.setHeader("x-array", ["a", "b"]);
    res.end("ok");
  });
  let proxyCalls = 0;
  const proxy = await server((_req, res) => {
    proxyCalls++;
    res.end("proxy");
  });
  const previous = process.env.HTTP_PROXY;
  process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
  const transport = loopbackTransport(
    target.port,
    new AbortController().signal,
  );
  const url = `http://127.0.0.1:${target.port}/v1/snapshot`;
  try {
    assert.equal(
      await (await transport.fetch(url, { method: "GET" })).text(),
      "ok",
    );
    assert.equal(proxyCalls, 0);
    assert.equal(calls, 1);
    for (const path of [
      "http://localhost:" + target.port + "/v1/snapshot",
      url + "/extra",
      url + "?redirect=1",
      `http://127.0.0.1:${target.port}/v1/events?after=0&limit=129`,
    ])
      await assert.rejects(transport.fetch(path, { method: "GET" }));
    await assert.rejects(transport.fetch(url, { method: "POST" }));
    await assert.rejects(
      transport.fetch(url, {
        method: "GET",
        headers: { Origin: "http://evil" },
      }),
    );
    await assert.rejects(transport.fetch(url, { method: "GET", body: "x" }));
    transport.close();
    await assert.rejects(transport.fetch(url, { method: "GET" }));
  } finally {
    transport.close();
    await target.close();
    await proxy.close();
    if (previous === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previous;
  }
});
test("transport aborts streams and bounds chunked bodies; errors/redirects never return a model", async () => {
  for (const mode of [
    "oversize",
    "abort",
    "cancel",
    "redirect",
    "error",
  ] as const) {
    const source = await server((_req, res) => {
      if (mode === "redirect") {
        res.writeHead(302, { location: "http://example.com" });
        res.end();
      } else if (mode === "error") res.destroy();
      else if (mode === "oversize") res.end("x".repeat(256 * 1024 + 1));
      else {
        res.write("first");
      }
    });
    const abort = new AbortController();
    const transport = loopbackTransport(source.port, abort.signal);
    try {
      const request = transport.fetch(
        `http://127.0.0.1:${source.port}/v1/snapshot`,
        { method: "GET" },
      );
      if (mode === "redirect" || mode === "error")
        await assert.rejects(request);
      else {
        const response = await request;
        if (mode === "cancel") await response.body?.cancel();
        else {
          const body = response.text();
          if (mode === "abort") transport.close();
          await assert.rejects(body);
        }
      }
    } finally {
      transport.close();
      await source.close();
    }
  }
});
test("readiness closes probes, honors cancellation and never treats timeout as pairing", async () => {
  const source = await server((_req, res) => res.end());
  const abort = new AbortController();
  assert.equal(await listening(source.port, abort.signal), true);
  await waitForListener(source.port, abort.signal);
  await source.close();
  assert.equal(await listening(source.port, abort.signal), false);
  await assert.rejects(waitForListener(await freePort(), abort.signal, 1));
  abort.abort();
  await assert.rejects(listening(source.port, abort.signal));
});
test("public helper rejects signed header/body identity changes and invalid DTOs through real native HTTP", async () => {
  const a = "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    b = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";
  const key = new Uint8Array(32).fill(17),
    id = "a".repeat(32);
  for (const mode of [
    "honest",
    "header",
    "body",
    "both",
    "state",
    "bad-mac",
  ] as const) {
    const source = await server((req, res) => {
      const status = req.url === "/v1/status",
        events = req.url?.startsWith("/v1/events");
      const instance = !status && ["header", "both"].includes(mode) ? b : a;
      const value = status
        ? { version: 1, instanceId: a, expiresInMs: 900000 }
        : events
          ? {
              version: 1,
              instanceId: a,
              events: [],
              next: 0,
              lost: 0,
              closed: false,
            }
          : {
              version: 1,
              instanceId: ["body", "both"].includes(mode) ? b : a,
              state: mode === "state" ? "bad" : "running",
              failureCode: null,
              nodes: [],
              edges: [],
              truncated: false,
              droppedEvents: 0,
            };
      const text = JSON.stringify(value);
      const fields = [
        "setu-diagnostics-v1",
        "response",
        id,
        instance,
        String(req.headers["x-setu-sequence"]),
        req.url!,
        "200",
        createHash("sha256").update(text).digest("hex"),
      ];
      res.setHeader("x-setu-instance", instance);
      res.setHeader(
        "x-setu-mac",
        mode === "bad-mac"
          ? "0".repeat(64)
          : createHmac("sha256", key).update(fields.join("\n")).digest("hex"),
      );
      res.end(text);
    });
    const client = coreClient(
      source.port,
      id,
      key.slice(),
      new AbortController().signal,
    );
    try {
      await assert.rejects(client.read(0));
      if (mode === "honest") {
        assert.ok(Object.isFrozen(await client.snapshot()));
        assert.equal((await client.read(0)).next, 0);
      } else await assert.rejects(client.snapshot());
    } finally {
      client.close();
      await source.close();
    }
  }
});

test("readiness waits for a delayed listener and respects a hard deadline", async () => {
  const port = await freePort(),
    source = createServer((_req, res) => res.end());
  const starting = new Promise<void>((resolve) => {
    setTimeout(() => source.listen(port, "127.0.0.1", resolve), 350);
  });
  try {
    await waitForListener(port, new AbortController().signal, 3000);
    await starting;
  } finally {
    source.closeAllConnections();
    await new Promise<void>((resolve) => source.close(() => resolve()));
  }
  const before = performance.now();
  await assert.rejects(waitForListener(port, new AbortController().signal, 20));
  assert.ok(
    performance.now() - before < 200,
    "deadline must interrupt the 250ms backoff",
  );
});
