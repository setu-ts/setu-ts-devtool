import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { launchOwned } from "../../src/launch/launcher";
import { resolveDeno } from "../../src/launch/executable";
import { credentials } from "../../src/launch/credentials";
import { freePort } from "../fixtures/projects";
import { waitForListener, listening } from "../../src/launch/readiness";
for (const early of [false, true])
  test(
    `cleanup removes SIGTERM-resistant descendant after ${early ? "root exit" : "explicit Stop"}`,
    { timeout: 20000 },
    async () => {
      await mkdir(".tmp", { recursive: true });
      const root = await mkdtemp(resolve(".tmp/process-"));
      const port = await freePort();
      const pair = credentials();
      const executable = await resolveDeno(undefined, [root]);
      const childCode = `Deno.addSignalListener('SIGTERM',()=>{});Deno.serve({hostname:'127.0.0.1',port:${port}},()=>new Response('ready'));`;
      await writeFile(
        join(root, "deno.json"),
        JSON.stringify({ tasks: { dev: "deno run --allow-run worker.ts" } }),
      );
      await writeFile(
        join(root, "worker.ts"),
        `new Deno.Command(Deno.execPath(),{args:['eval',${JSON.stringify(childCode)}],stdio:'null'}).spawn();${early ? "setTimeout(()=>Deno.exit(7),1500);" : 'Deno.addSignalListener("SIGTERM",()=>Deno.exit());setInterval(()=>{},1000);'}`,
      );
      const abort = new AbortController();
      const owned = await launchOwned(
        {
          root,
          directory: root,
          member: null,
          port,
          members: ["synthetic"],
          fingerprint: "fixture",
        },
        executable,
        resolve("dist/supervisor.mjs"),
        pair.id,
        pair.encoded,
        abort.signal,
      );
      try {
        await waitForListener(port, abort.signal, 5000);
        if (early) assert.equal(await owned.exited, 7);
        const before = performance.now();
        assert.equal(await owned.stop(), true);
        assert.ok(performance.now() - before >= 4000);
        assert.equal(await listening(port, abort.signal), false);
        assert.equal(await owned.recheck(), true);
      } finally {
        await owned.stop();
        pair.key.fill(0);
        await rm(root, { recursive: true, force: true });
      }
    },
  );
test("pre-aborted launch creates no process; early supervisor failure stays conservative", async () => {
  const pair = credentials(),
    abort = new AbortController();
  abort.abort();
  const executable = await resolveDeno(undefined, []);
  const descriptor = {
    root: resolve(".tmp"),
    directory: resolve(".tmp"),
    member: null,
    port: 4919,
    members: ["fixture"],
    fingerprint: "x",
  };
  await assert.rejects(
    launchOwned(
      descriptor,
      executable,
      resolve("dist/supervisor.mjs"),
      pair.id,
      pair.encoded,
      abort.signal,
    ),
  );
  await assert.rejects(
    launchOwned(
      descriptor,
      executable,
      resolve(".tmp/no-supervisor.mjs"),
      pair.id,
      pair.encoded,
      new AbortController().signal,
    ),
    /CLEANUP_REQUIRED/,
  );
  pair.key.fill(0);
});
