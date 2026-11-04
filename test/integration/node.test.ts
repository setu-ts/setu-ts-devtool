import { test } from "node:test";
import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  rename,
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
      // A user .npmrc could pick the sibling's unchecked `dev` for the
      // runner's nested npm; the launch ignores user and global config.
      const home = join(fixture.root, "home");
      await mkdir(home);
      await writeFile(
        join(home, ".npmrc"),
        `workspace=worker\nnode-options=--require=${preload}\n`,
      );
      const previousHome = process.env.HOME;
      process.env.HOME = home;
      if (workspace) {
        const sibling = join(fixture.root, "apps/worker/package.json");
        const value = JSON.parse(await readFile(sibling, "utf8"));
        value.scripts.dev = `node -e "require('fs').appendFileSync('${marker}','sibling '+Boolean(process.env.SETU_DEVTOOL_SESSION_KEY)+'\\n')"`;
        await writeFile(sibling, JSON.stringify(value));
      }
      const session = await launch(fixture).finally(() => {
        process.env.HOME = previousHome;
      });
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

test(
  "a root .npmrc that picks another workspace's script is refused before launch",
  { timeout: 60000 },
  async () => {
    const fixture = await preparedNodeProject(true);
    try {
      const worker = join(fixture.root, "apps/worker/package.json");
      const manifest = JSON.parse(await readFile(worker, "utf8"));
      manifest.scripts.dev = `node -e "require('fs').writeFileSync('${join(fixture.root, "marker")}', process.env.SETU_DEVTOOL_SESSION_KEY ?? '')"`;
      await writeFile(worker, JSON.stringify(manifest));
      const project = (await discover([fixture.root])).projects.find(
        (p) => p.member === "api",
      );
      assert.ok(project);
      await prepareLaunch(project, fixture.port);
      // npm sets npm_package_name from the root package for the runner, so
      // the third key becomes `workspace` inside the runner's nested npm.
      const rootManifest = join(fixture.root, "package.json");
      const root = JSON.parse(await readFile(rootManifest, "utf8"));
      await writeFile(
        rootManifest,
        JSON.stringify({ ...root, name: "workspace" }),
      );
      for (const npmrc of [
        "workspace=apps/worker",
        "userconfig=/tmp/x",
        "${npm_package_name}=worker",
        '"workspace"=worker',
        "foo=bar\rworkspace=worker",
      ]) {
        await writeFile(join(fixture.root, ".npmrc"), npmrc + "\n");
        await assert.rejects(
          prepareLaunch(project, fixture.port),
          /PREPARATION_FAILED/,
        );
      }
      assert.ok(await gone(join(fixture.root, "marker")));
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test(
  "a parent npm workspace outside the project cannot redirect its dev script",
  { timeout: 90000 },
  async () => {
    const fixture = await preparedNodeProject();
    const parent = await mkdtemp(resolve(".tmp/parent-workspace-"));
    const app = join(parent, "app");
    await rename(fixture.root, app);
    const previous = process.env.PORT;
    process.env.PORT = String(fixture.appPort);
    const marker = join(parent, "marker");
    await writeFile(
      join(parent, "package.json"),
      JSON.stringify({ private: true, workspaces: ["app", "other"] }),
    );
    await writeFile(join(parent, ".npmrc"), "workspace=other\n");
    await mkdir(join(parent, "other"));
    await writeFile(
      join(parent, "other/package.json"),
      JSON.stringify({
        name: "other",
        scripts: {
          dev: `node -e "require('fs').writeFileSync('${marker}', process.env.SETU_DEVTOOL_SESSION_KEY ?? '')"`,
        },
      }),
    );
    const session = await launch({ ...fixture, root: app });
    try {
      assert.equal(session.status().state, "Live");
      await session.stop();
      assert.ok(await gone(marker), "another package's script ran");
    } finally {
      await session.stop();
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
      await rm(parent, { recursive: true, force: true });
    }
  },
);
