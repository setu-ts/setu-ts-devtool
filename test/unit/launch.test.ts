import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rm,
  writeFile,
  readFile,
  chmod,
  symlink,
  mkdir,
  mkdtemp,
  rename,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { discover } from "../../src/discovery/discover";
import { prepareLaunch, redirectsNpm } from "../../src/launch/preflight";
import { resolveDeno, verifyDeno, inside } from "../../src/launch/executable";
import {
  credentials,
  applicationEnvironment,
} from "../../src/launch/credentials";
import {
  entryMatches,
  taskMatches,
  runnerMatches,
  scriptMatches,
} from "../../src/launch/recipes";
import {
  parseStat,
  processIdentity,
  processVanished,
  terminateUnknownGroup,
  liveMembers,
} from "../../src/launch/process-group";
import { preparedNodeProject, preparedProject } from "../fixtures/projects";
import recipes from "../../.tmp/artifacts/recipes.json";
test("preflight validates the entire scope and detects changed or custom recipes", async () => {
  const f = await preparedProject(true);
  try {
    const p = (await discover([f.root])).projects[0]!;
    const d = await prepareLaunch(p, f.port);
    assert.deepEqual(d.members, ["api", "worker"]);
    for (const port of [-1, 65536, 1.5])
      await assert.rejects(prepareLaunch(p, port));
    await assert.rejects(
      prepareLaunch({ ...p, directory: join(f.root, "absent") }, f.port),
    );
    const runner = join(f.root, "scripts/dev.ts"),
      original = await readFile(runner, "utf8");
    await writeFile(runner, original + "// custom");
    await assert.rejects(prepareLaunch(p, f.port));
    await writeFile(runner, original);
    const file = join(f.root, "apps/worker/deno.json"),
      text = await readFile(file, "utf8");
    await writeFile(
      file,
      JSON.stringify({ tasks: { start: "echo surprise" } }),
    );
    await assert.rejects(prepareLaunch(p, f.port));
    await writeFile(file, text);
    const entry = join(f.root, "apps/api/main.dev.ts"),
      entryText = await readFile(entry, "utf8");
    await writeFile(
      entry,
      entryText.replace(`port: ${f.port},`, "port: 49191,"),
    );
    await assert.rejects(prepareLaunch(p, f.port));
    await writeFile(entry, entryText);
    await writeFile(
      join(f.root, "apps/api/src/discovery/services.ts"),
      "// changed",
    );
    assert.notEqual(
      (await prepareLaunch(p, f.port)).fingerprint,
      d.fingerprint,
    );
    await writeFile(join(f.root, "apps/api/deno.jsonc"), "{}");
    await assert.rejects(prepareLaunch(p, f.port));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("standalone requires explicit matching port and prepared Deno task", async () => {
  const f = await preparedProject();
  try {
    const p = (await discover([f.root])).projects[0]!;
    assert.equal((await prepareLaunch(p, f.port)).member, null);
    const file = join(f.root, "deno.json");
    const original = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      file,
      JSON.stringify({
        ...original,
        tasks: { dev: recipes.tasks[0], predev: "echo surprise" },
      }),
    );
    await assert.rejects(prepareLaunch(p, f.port));
    await rm(join(f.root, "main.dev.ts"));
    await assert.rejects(prepareLaunch(p, f.port));
    assert.ok(entryMatches(recipes.standalone[0]!, 49191, false));
    assert.ok(runnerMatches(recipes.runner[0]!));
    assert.equal(runnerMatches("custom"), false);
    assert.equal(taskMatches({}, true), false);
    assert.equal(taskMatches("custom", false), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("executable lookup excludes workspace/PATH tricks, rejects changes and checks real version", async () => {
  const f = await preparedProject();
  try {
    assert.equal(inside("/one/two", "/one"), true);
    assert.equal(inside("/other", "/one"), false);
    assert.equal(inside("/one", "/one"), true);
    await assert.rejects(resolveDeno("relative", []));
    await assert.rejects(resolveDeno(undefined, [], ".:/missing"));
    const executable = await resolveDeno(undefined, [f.root]);
    await verifyDeno(executable);
    await assert.rejects(
      resolveDeno(executable.path, [dirname(executable.path)]),
    );
    const fake = join(f.root, "deno");
    await writeFile(fake, "#!/bin/sh\necho deno 0.0.0\n");
    await chmod(fake, 0o755);
    await assert.rejects(resolveDeno(fake, [f.root]));
    const wrong = await resolveDeno(fake, []);
    await assert.rejects(verifyDeno(wrong));
    await writeFile(fake, "changed");
    await assert.rejects(verifyDeno(wrong));
    await mkdir(join(f.root, "bin"));
    await symlink(executable.path, join(f.root, "bin/deno"));
    await assert.rejects(resolveDeno(undefined, [f.root], join(f.root, "bin")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("credentials are fresh; inherited handoff and runtime injection are removed", () => {
  const a = credentials(),
    b = credentials();
  assert.match(a.id, /^[a-f0-9]{32}$/);
  assert.match(a.encoded, /^[a-f0-9]{64}$/);
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a.key, b.key);
  assert.deepEqual(
    applicationEnvironment("/safe", {
      PATH: ".",
      SETU_DEVTOOL_SESSION_KEY: "canary",
      SETU_DEVTOOL_MEMBER: "canary",
      NODE_OPTIONS: "bad",
      NODE_CHANNEL_FD: "3",
      ELECTRON_RUN_AS_NODE: "1",
      VSCODE_TEST: "x",
      NORMAL: "keep",
      MISSING: undefined,
    }),
    { PATH: "/safe", NORMAL: "keep" },
  );
  a.key.fill(0);
  b.key.fill(0);
});
test("a Node launch replaces every inherited npm setting with the fixed ones", () => {
  const source = {
    PATH: ".",
    npm_config_script_shell: "/evil",
    NPM_CONFIG_NODE_OPTIONS: "--require=/evil.js",
    Npm_Config_Userconfig: "/evil/npmrc",
    npm_config_registry: "https://registry.example",
    NORMAL: "keep",
  };
  assert.deepEqual(applicationEnvironment("/safe", source, "node"), {
    PATH: "/safe",
    NORMAL: "keep",
    npm_config_ignore_scripts: "true",
    npm_config_script_shell: "/bin/sh",
    npm_config_node_options: " ",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_logs_max: "0",
  });
  // Deno honours an npm registry setting from the environment: kept.
  assert.equal(
    applicationEnvironment("/safe", source).npm_config_registry,
    "https://registry.example",
  );
});
test("Linux identity handles parentheses and zero system groups without losing identity", async () => {
  const record = await processIdentity(process.pid);
  assert.equal(record.pid, process.pid);
  assert.ok(
    (await liveMembers(record.group, record.session)).includes(process.pid),
  );
  assert.throws(() => parseStat("malformed"));
  const fields = ["Z", "1", "0", "0", ...Array<string>(15).fill("0"), "100"];
  assert.equal(
    parseStat("99 (name with ) parentheses) " + fields.join(" ")).zombie,
    true,
  );
  assert.equal(resolve("dist/supervisor.mjs").endsWith("supervisor.mjs"), true);
});
test("Linux cleanup classifies vanished processes and escalates unknown groups", () => {
  assert.equal(processVanished({ code: "ENOENT" }), true);
  assert.equal(processVanished({ code: "ESRCH" }), true);
  assert.equal(processVanished({ code: "EACCES" }), false);
  assert.equal(processVanished(null), false);
  const calls: string[] = [];
  assert.throws(
    () =>
      terminateUnknownGroup(
        (pid, signal) => calls.push(`${pid}:${signal}`),
        (code) => {
          calls.push(`exit:${code}`);
          throw new Error("EXIT");
        },
      ),
    /EXIT/,
  );
  assert.deepEqual(calls, ["0:SIGKILL", "exit:1"]);
  assert.throws(
    () =>
      terminateUnknownGroup(
        () => {
          throw new Error("SIGNAL");
        },
        (code) => {
          calls.push(`failed-signal-exit:${code}`);
          throw new Error("EXIT");
        },
      ),
    /EXIT/,
  );
  assert.equal(calls.at(-1), "failed-signal-exit:1");
});
test("Node preflight compares the scripts, entry and runner, and requires an installed tsx", async () => {
  for (const workspace of [false, true]) {
    const fixture = await preparedNodeProject(workspace);
    try {
      const project = (await discover([fixture.root])).projects.find(
        (p) => p.member === null || p.member === "api",
      );
      assert.ok(project);
      assert.equal(project.runtime, "node");
      const ready = await prepareLaunch(project, fixture.port);
      assert.equal(ready.runtime, "node");
      const dir = workspace ? join(fixture.root, "apps/api") : fixture.root;
      const edits: [string, (text: string) => string][] = [
        [join(dir, "main.dev.ts"), (t) => t.replace("4919", "4918") + " "],
        [
          join(dir, "package.json"),
          (t) => t.replace('"tsx main.dev.ts"', '"tsx watch main.dev.ts"'),
        ],
        ...(workspace
          ? ([
              [join(fixture.root, "scripts/dev.mjs"), (t: string) => t + "\n"],
              [
                join(fixture.root, "package.json"),
                (t: string) => t.replace("node scripts/dev.mjs", "node x.mjs"),
              ],
              // npm would walk past a root whose workspaces miss the member.
              [
                join(fixture.root, "package.json"),
                (t: string) => t.replace('"apps/*"', '"libs/*"'),
              ],
              [
                join(fixture.root, "package.json"),
                (t: string) =>
                  t.replace(
                    /"workspaces":\s*\[[^\]]*\]/,
                    '"workspaces":"apps/*"',
                  ),
              ],
              [
                join(fixture.root, "apps/worker/package.json"),
                (t: string) => t.replace("tsx watch main.ts", "tsx main.ts"),
              ],
            ] as [string, (text: string) => string][])
          : []),
      ];
      for (const [path, edit] of edits) {
        const text = await readFile(path, "utf8");
        await writeFile(path, edit(text));
        await assert.rejects(
          prepareLaunch(project, fixture.port),
          /PREPARATION_FAILED/,
          path,
        );
        await writeFile(path, text);
      }
      // ignore_scripts stops these, so they are not refused.
      const manifest = join(dir, "package.json");
      const original = await readFile(manifest, "utf8");
      const withHooks = JSON.parse(original);
      withHooks.scripts.predev = "echo pre";
      await writeFile(manifest, JSON.stringify(withHooks));
      await prepareLaunch(project, fixture.port);
      await writeFile(manifest, original);
      await rm(join(fixture.root, "node_modules/tsx"), { recursive: true });
      await assert.rejects(
        prepareLaunch(project, fixture.port),
        /PREPARATION_FAILED/,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});
test("Node preflight refuses node or npm above the root and needs tsx inside it", async () => {
  for (const workspace of [false, true]) {
    const fixture = await preparedNodeProject(workspace);
    const above = await mkdtemp(resolve(".tmp/above-"));
    const root = join(above, "app");
    try {
      await rename(fixture.root, root);
      const project = (await discover([root])).projects.find(
        (p) => p.member === null || p.member === "api",
      );
      assert.ok(project);
      await prepareLaunch(project, fixture.port);
      const bin = join(above, "node_modules", ".bin");
      for (const name of ["node", "npm"]) {
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, name), "#!/bin/sh\n");
        await assert.rejects(
          prepareLaunch(project, fixture.port),
          /PREPARATION_FAILED/,
          name,
        );
        await rm(join(above, "node_modules"), { recursive: true });
      }
      // A dangling link still shadows nothing, but is refused all the same.
      await mkdir(bin, { recursive: true });
      await symlink(join(above, "missing"), join(bin, "node"));
      await assert.rejects(
        prepareLaunch(project, fixture.port),
        /PREPARATION_FAILED/,
      );
      await rm(join(above, "node_modules"), { recursive: true });
      // A file where the directory would be cannot hold a .bin.
      await writeFile(join(above, "node_modules"), "");
      await prepareLaunch(project, fixture.port);
      await rm(join(above, "node_modules"));
      // An unreadable directory above the root cannot be ruled out.
      await mkdir(bin, { recursive: true });
      await chmod(join(above, "node_modules"), 0o000);
      await assert.rejects(
        prepareLaunch(project, fixture.port),
        /PREPARATION_FAILED/,
      );
      await chmod(join(above, "node_modules"), 0o755);
      await rm(join(above, "node_modules"), { recursive: true });
      // Without the root's own tsx link, PATH would search above the root.
      await rm(join(root, "node_modules", ".bin", "tsx"));
      await assert.rejects(
        prepareLaunch(project, fixture.port),
        /PREPARATION_FAILED/,
      );
    } finally {
      await chmod(join(above, "node_modules"), 0o755).catch(() => {});
      await rm(above, { recursive: true, force: true });
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});
test("recipe matchers cover the Node catalog", () => {
  assert.ok(
    entryMatches(
      recipes.node.standalone[0]!.replace("port: 49191,", "port: 5000,"),
      5000,
      false,
      "node",
    ),
  );
  assert.ok(runnerMatches(recipes.node.runner[0]!, "node"));
  assert.equal(runnerMatches(recipes.node.runner[0]!), false);
  assert.ok(scriptMatches("tsx main.dev.ts", true));
  assert.ok(scriptMatches("tsx dev.ts", false));
  assert.equal(scriptMatches("tsx main.dev.ts", false), false);
  assert.equal(scriptMatches(1, false), false);
});
test("npm settings that redirect which script runs are recognised in any spelling", () => {
  for (const text of [
    "workspace=apps/worker",
    "  Workspace = apps/worker",
    "workspaces=true",
    "workspaces",
    "include_workspace_root=true",
    "include-workspace-root=true",
    "globalconfig=/tmp/other",
    "workspace[]=apps/worker",
    "registry=https://r.example\r\nworkspace=b",
    // Spellings npm reads differently from the text (D06 re-review).
    "foo=bar\rworkspace=b",
    '"workspace"=b',
    "${npm_package_name}=worker",
    "work\\space=b",
    "[section]",
  ])
    assert.ok(redirectsNpm(text), text);
  for (const text of [
    "",
    "# workspace=apps/worker",
    "; workspaces=true",
    "registry=https://r.example",
    "//r.example/:_authToken=${TOKEN}",
    "@scope:registry=https://r.example",
  ])
    assert.equal(redirectsNpm(text), false, text);
});
