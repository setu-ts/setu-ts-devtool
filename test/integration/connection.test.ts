import { test } from "node:test";
import { exerciseConnection } from "../fixtures/exercise";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preparedProject } from "../fixtures/projects";
import { discover } from "../../src/discovery/discover";
import { prepareLaunch } from "../../src/launch/preflight";
import { resolveDeno } from "../../src/launch/executable";
import { launchOwned } from "../../src/launch/launcher";
import { listening, waitForListener } from "../../src/launch/readiness";
import { coreClient } from "../../src/diagnostics/client";
import { schedule } from "../../src/session/scheduler";
import { planLifetime } from "../../src/session/lifetime";
import type { LaunchDescriptor } from "../../src/launch/preflight";
import { SessionController } from "../../src/session/controller";

for (const workspace of [false, true])
  test(
    `real ${workspace ? "workspace" : "standalone"} launch, pair, request capture and Stop`,
    { timeout: 90000 },
    () => exerciseConnection(workspace),
  );

test(
  "occupied port refuses launch; failed startup requires a fresh explicit launch",
  { timeout: 20000 },
  async () => {
    const fixture = await preparedProject();
    const previous = process.env.PORT;
    process.env.PORT = String(fixture.appPort);
    const pairs: string[] = [];
    const session = new SessionController(
      resolve("dist/supervisor.mjs"),
      () => {},
      {
        launch: async (descriptor, executable, supervisor, id, key, signal) => {
          pairs.push(id + key);
          return launchOwned(
            descriptor,
            executable,
            supervisor,
            id,
            key,
            signal,
          );
        },
        listening,
        ready: waitForListener,
        client: coreClient,
        schedule,
        plan: planLifetime,
      },
    );
    const occupied = createServer((socket) => socket.destroy());
    try {
      const project = (await discover([fixture.root])).projects[0];
      assert.ok(project);
      const descriptor = await prepareLaunch(project, fixture.port);
      const executable = await resolveDeno(undefined, [fixture.root]);
      const prepare = async () => ({ descriptor, executable });
      await new Promise<void>((resolve) =>
        occupied.listen(fixture.port, "127.0.0.1", resolve),
      );
      await session.start(prepare);
      assert.equal(session.status().state, "Failed");
      assert.equal(pairs.length, 0);
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
      const config = join(fixture.root, "setu.config.ts"),
        original = await readFile(config, "utf8");
      await writeFile(
        config,
        "export function createApp() { throw new Error('synthetic startup failure'); }\n",
      );
      await session.start(prepare);
      assert.equal(session.status().state, "Failed");
      assert.equal(session.status().events, 0);
      assert.equal(pairs.length, 1);
      await writeFile(config, original);
      await session.start(prepare);
      assert.equal(session.status().state, "Live");
      assert.equal(pairs.length, 2);
      assert.notEqual(pairs[0], pairs[1]);
      await session.stop();
      assert.equal(session.status().state, "Idle");
    } finally {
      occupied.close();
      await session.stop();
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

/** The real client, counting renew calls that reach it. */
function countingClient() {
  const count = { renewals: 0 };
  const client: typeof coreClient = (...args) => {
    const inner = coreClient(...args);
    return {
      ...inner,
      renew: () => {
        count.renewals++;
        return inner.renew();
      },
    };
  };
  return { client, count };
}
const ports = (
  client: typeof coreClient,
  plan: typeof planLifetime = planLifetime,
) => ({
  launch: launchOwned,
  listening,
  ready: waitForListener,
  client,
  schedule,
  plan,
});
async function waitFor(condition: () => boolean, ms: number): Promise<number> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > ms) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return performance.now() - start;
}

test(
  "real renewal through the generated entry keeps the session Live",
  { timeout: 60000 },
  async () => {
    const fixture = await preparedProject();
    const previous = process.env.PORT;
    process.env.PORT = String(fixture.appPort);
    const { client, count } = countingClient();
    // Renew one second after each lifetime instead of half of 15 minutes.
    const session = new SessionController(
      resolve("dist/supervisor.mjs"),
      () => {},
      ports(client, (sentAt, lifetime) => ({
        ...planLifetime(sentAt, lifetime),
        renewAt: lifetime.renewal ? sentAt + 1000 : null,
      })),
    );
    try {
      const project = (await discover([fixture.root])).projects[0];
      assert.ok(project);
      const descriptor = await prepareLaunch(project, fixture.port);
      const executable = await resolveDeno(undefined, [fixture.root]);
      await session.start(async () => ({ descriptor, executable }));
      assert.equal(session.status().state, "Live");
      const first = session.status().lifetime;
      assert.ok(first?.renewable);
      assert.ok(first.maxRemainingMs! > 28_700_000);
      await waitFor(() => count.renewals >= 2, 10000);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(session.status().state, "Live");
      // A real renewal answered with a full window again.
      assert.ok(session.status().lifetime!.remainingMs > 890000);
    } finally {
      await session.stop();
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

for (const renewable of [true, false])
  test(
    `a real ${renewable ? "capped renewable" : "fixed"} short session stops at its deadline`,
    { timeout: 60000 },
    async () => {
      const fixture = await preparedProject();
      const previous = process.env.PORT;
      process.env.PORT = String(fixture.appPort);
      // Outside preflight: only the lifetime options differ from the recipe.
      const entry = join(fixture.root, "main.dev.ts");
      const text = await readFile(entry, "utf8");
      assert.ok(text.includes("  maxSessionLifetimeMs: 28_800_000,\n"));
      await writeFile(
        entry,
        text.replace(
          "  maxSessionLifetimeMs: 28_800_000,\n",
          renewable
            ? "  ttlMs: 3000,\n  maxSessionLifetimeMs: 7000,\n"
            : "  ttlMs: 3000,\n",
        ),
      );
      const descriptor: LaunchDescriptor = {
        root: fixture.root,
        directory: fixture.root,
        member: null,
        port: fixture.port,
        members: ["app"],
        fingerprint: "short-lifetime",
      };
      const { client, count } = countingClient();
      const session = new SessionController(
        resolve("dist/supervisor.mjs"),
        () => {},
        ports(client),
      );
      try {
        const executable = await resolveDeno(undefined, [fixture.root]);
        const started = performance.now();
        await session.start(async () => ({ descriptor, executable }));
        assert.equal(session.status().state, "Live");
        assert.equal(session.status().lifetime?.renewable, renewable);
        await waitFor(() => session.status().state === "Failed", 15000);
        const lived = performance.now() - started;
        assert.equal(session.status().ended, "deadline");
        if (renewable) {
          assert.ok(count.renewals >= 2, `renewals: ${count.renewals}`);
          assert.ok(lived > 4000 && lived < 9000, `lived ${lived} ms`);
        } else {
          assert.equal(count.renewals, 0);
          assert.ok(lived < 4500, `lived ${lived} ms`);
        }
        // The deadline stop is the ordinary cleanup: the listener is gone.
        assert.equal(
          await listening(fixture.port, new AbortController().signal),
          false,
        );
      } finally {
        await session.stop();
        if (previous === undefined) delete process.env.PORT;
        else process.env.PORT = previous;
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );
