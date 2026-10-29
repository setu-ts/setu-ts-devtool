import { test } from "node:test";
import assert from "node:assert/strict";
import {
  access,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { preparedNodeProject } from "../fixtures/projects";
import { discover } from "../../src/discovery/discover";
import { prepareLaunch } from "../../src/launch/preflight";
import { resolveNode, verifyNode } from "../../src/launch/executable";
import { listening } from "../../src/launch/readiness";
import { liveMembers } from "../../src/launch/process-group";
import { SessionController } from "../../src/session/controller";

async function launch(
  fixture: Awaited<ReturnType<typeof preparedNodeProject>>,
) {
  const session = new SessionController(
    resolve("dist/supervisor.mjs"),
    () => {},
  );
  const project = (await discover([fixture.root])).projects.find(
    (p) => p.diagnosticsPort !== null || p.member === null,
  );
  assert.ok(project);
  const descriptor = await prepareLaunch(project, fixture.port);
  const executable = await resolveNode(undefined, [fixture.root]);
  await verifyNode(executable);
  await session.start(async () => ({ descriptor, executable }));
  return session;
}
const gone = async (path: string) =>
  access(path).then(
    () => false,
    () => true,
  );

for (const workspace of [false, true])
  test(
    `a hostile .npmrc and pre/post scripts take no effect (${workspace ? "workspace member" : "standalone"})`,
    { timeout: 90000 },
    async () => {
      const fixture = await preparedNodeProject(workspace);
      const previous = process.env.PORT;
      process.env.PORT = String(fixture.appPort);
      const marker = join(fixture.root, "marker");
      const preload = join(fixture.root, "preload.cjs");
      await writeFile(
        preload,
        `require("node:fs").appendFileSync(${JSON.stringify(marker)}, "preload\\n");`,
      );
      // Placed where npm reads it for the script that starts the inspected
      // application: the project, or the selected member under the runner.
      const dir = workspace ? join(fixture.root, "apps/api") : fixture.root;
      // npm reads the workspace root's .npmrc for a member, so write both.
      for (const at of new Set([fixture.root, dir]))
        await writeFile(
          join(at, ".npmrc"),
          `script-shell=/nonexistent/shell\nnode-options=--require=${preload}\n`,
        );
      const manifestPath = join(dir, "package.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.scripts.predev = `node -e "require('fs').appendFileSync('${marker}','pre\\n')"`;
      manifest.scripts.postdev = manifest.scripts.predev.replace("pre", "post");
      await writeFile(manifestPath, JSON.stringify(manifest));
      const session = await launch(fixture);
      try {
        assert.equal(session.status().state, "Live");
        await session.stop();
        assert.equal(session.status().state, "Idle");
        assert.ok(await gone(marker), "a hostile setting ran code");
      } finally {
        await session.stop();
        if (previous === undefined) delete process.env.PORT;
        else process.env.PORT = previous;
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

test(
  "killing npm from outside tears down the whole Node chain",
  { timeout: 60000 },
  async () => {
    const fixture = await preparedNodeProject();
    const previous = process.env.PORT;
    process.env.PORT = String(fixture.appPort);
    const session = await launch(fixture);
    try {
      assert.equal(session.status().state, "Live");
      // The npm process is the supervisor's child; its group is the supervisor's.
      let npm: { pid: number; group: number } | undefined;
      for (const entry of await readdir("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        try {
          const cmdline = (
            await readFile(`/proc/${entry}/cmdline`, "utf8")
          ).split("\0");
          const cwd = await readlink(`/proc/${entry}/cwd`);
          if (
            cwd === fixture.root &&
            // npm retitles itself; the title replaces its argv in /proc.
            /^npm run dev\b|npm-cli\.js run dev\b/.test(cmdline.join(" "))
          ) {
            const stat = (await readFile(`/proc/${entry}/stat`, "utf8"))
              .split(") ")[1]!
              .split(" ");
            npm = { pid: Number(entry), group: Number(stat[2]) };
          }
        } catch {
          /* Vanished or not ours. */
        }
      }
      assert.ok(npm, "npm run dev was not found");
      process.kill(npm.pid, "SIGKILL");
      for (let i = 0; i < 100 && session.status().state !== "Failed"; i++)
        await delay(100);
      assert.equal(session.status().state, "Failed");
      assert.deepEqual(await liveMembers(npm.group, npm.group), []);
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
