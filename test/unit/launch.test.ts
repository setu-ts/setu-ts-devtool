import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rm,
  writeFile,
  readFile,
  chmod,
  symlink,
  mkdir,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { discover } from "../../src/discovery/discover";
import { prepareLaunch } from "../../src/launch/preflight";
import { resolveDeno, verifyDeno, inside } from "../../src/launch/executable";
import {
  credentials,
  applicationEnvironment,
} from "../../src/launch/credentials";
import {
  entryMatches,
  taskMatches,
  runnerMatches,
} from "../../src/launch/recipes";
import {
  parseStat,
  processIdentity,
  liveMembers,
} from "../../src/launch/process-group";
import { preparedProject } from "../fixtures/projects";
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
