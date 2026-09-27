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
