import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { readJson, MAX_BYTES } from "../../src/discovery/json";
import { readFile } from "../../src/discovery/files";
import { discover } from "../../src/discovery/discover";
async function fixture(): Promise<string> {
  await mkdir(".tmp", { recursive: true });
  return mkdtemp(resolve(".tmp/discovery-"));
}
const cfg =
  '{"imports":{"@setu-ts/common":"jsr:@setu-ts/common"},"tasks":{"dev":"deno run main.dev.ts"}}';
test("bounded JSONC parsing rejects duplicate, malformed, deep and strict JSON inputs", () => {
  assert.equal(readJson('{/*ok*/"a":1,}', true).a, 1);
  for (const text of [
    '{"a":1,"a":2}',
    '{"a": {"x":1,"x":2}}',
    '{"a":',
    "[]",
    "null",
    '{/*no*/"a":1}',
    '{"a":1,}',
    '{"a":'.repeat(33) + "0" + "}".repeat(33),
    " ".repeat(MAX_BYTES + 1),
  ])
    assert.throws(() => readJson(text, false), /INVALID_PROJECT/);
  assert.equal(
    readJson('{"a":{"x":1},"b":{"x":2}}', false).b instanceof Object,
    true,
  );
});
test("standalone discovery deduplicates canonical roots and never retains private config", async () => {
  const root = await fixture();
  try {
    await writeFile(
      join(root, "deno.jsonc"),
      cfg.replace("}}", '},"private":"synthetic-secret"}'),
    );
    const result = await discover([root, root]);
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0]?.task, "candidate");
    assert.equal(result.projects[0]?.diagnosticsPort, null);
    assert.equal(JSON.stringify(result).includes("synthetic-secret"), false);
    assert.equal(Object.isFrozen(result.projects), true);
    assert.equal(
      (await discover(Array<string>(17).fill(root))).projects.length,
      0,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
test("authoritative workspace validates every member and strips transport credentials", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "apps/api"), { recursive: true });
    await writeFile(join(root, "apps/api/deno.json"), cfg);
    await writeFile(join(root, "deno.json"), cfg);
    const valid = {
      version: 1,
      basePort: 3000,
      transport: "http",
      transportUrl: "synthetic-secret",
      members: [{ name: "api", port: 3000, devtoolPort: 4919 }],
    };
    await writeFile(join(root, "setu.workspace.json"), JSON.stringify(valid));
    const result = await discover([root]);
    assert.equal(result.projects[0]?.member, "api");
    assert.equal(result.projects[0]?.diagnosticsPort, 4919);
    assert.equal(result.watchDirectories.length, 2);
    assert.equal(JSON.stringify(result).includes("synthetic-secret"), false);
    for (const manifest of [
      { ...valid, version: 2 },
      { ...valid, runtime: "node" },
      { ...valid, members: [{ name: "../api", port: 3000 }] },
      { ...valid, members: [{ name: "api", port: 3000, devtoolPort: 3000 }] },
      {
        ...valid,
        members: [{ name: "api", port: 3000, dependsOn: ["missing"] }],
      },
      { ...valid, members: [{ name: "api", port: 3000, dependsOn: ["api"] }] },
      { ...valid, members: [valid.members[0], valid.members[0]] },
      { ...valid, members: Array(65).fill(valid.members[0]) },
    ]) {
      await writeFile(
        join(root, "setu.workspace.json"),
        JSON.stringify(manifest),
      );
      const invalid = await discover([root]);
      assert.equal(invalid.projects.length, 0);
      assert.equal(invalid.issues.length, 1);
    }
    await writeFile(join(root, "setu.workspace.json"), "{");
    assert.equal((await discover([root])).projects.length, 0);
  } finally {
    await rm(root, { recursive: true });
  }
});
test("filesystem refuses linked files, directories, binary/oversized input and escape paths", async () => {
  const root = await fixture(),
    outside = await fixture();
  try {
    await writeFile(join(outside, "deno.json"), cfg);
    await symlink(join(outside, "deno.json"), join(root, "deno.json"));
    assert.equal((await discover([root])).issues.length, 1);
    await rm(join(root, "deno.json"));
    await symlink(outside, join(root, "apps"));
    await assert.rejects(readFile(root, "apps/deno.json"), /INVALID_PROJECT/);
    await assert.rejects(readFile(root, "../anything"), /INVALID_PROJECT/);
    await writeFile(join(root, "deno.json"), "x".repeat(MAX_BYTES + 1));
    await assert.rejects(readFile(root, "deno.json"), /INVALID_PROJECT/);
    await writeFile(join(root, "deno.json"), Buffer.from([255]));
    await assert.rejects(readFile(root, "deno.json"), /INVALID_PROJECT/);
    assert.equal(await readFile(root, "missing.json"), undefined);
  } finally {
    await rm(root, { recursive: true });
    await rm(outside, { recursive: true });
  }
});
test("unrelated Deno files are ignored, two configuration files are rejected", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "deno.json"), "{}");
    assert.equal((await discover([root])).projects.length, 0);
    await writeFile(join(root, "deno.jsonc"), cfg);
    assert.equal((await discover([root])).issues.length, 1);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("empty local root has no candidate and no error", async () => {
  const root = await fixture();
  try {
    const found = await discover([root]);
    assert.equal(found.projects.length, 0);
    assert.equal(found.issues.length, 0);
  } finally {
    await rm(root, { recursive: true });
  }
});
