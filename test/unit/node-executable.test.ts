import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { execFile } from "node:child_process";
import { resolveNode, verifyNode } from "../../src/launch/executable";

async function install(npmTarget = "lib/node_modules/npm/bin/npm-cli.js") {
  await mkdir(".tmp", { recursive: true });
  const base = await mkdtemp(resolve(".tmp/node-exec-"));
  const bin = join(base, "bin");
  await mkdir(bin);
  await mkdir(join(base, "lib/node_modules/npm/bin"), { recursive: true });
  await writeFile(join(base, "lib/node_modules/npm/bin/npm-cli.js"), "");
  await writeFile(join(base, "other.js"), "");
  await writeFile(join(bin, "node"), "#!/bin/sh\n");
  await chmod(join(bin, "node"), 0o755);
  await symlink(join(base, npmTarget), join(bin, "npm"));
  const workspace = join(base, "workspace");
  await mkdir(workspace);
  return { base, bin, workspace };
}
/** Answers `--version` for node and for `node <npm-cli.js>`. */
function runner(node: string, npm: string, fail = false): typeof execFile {
  return ((
    _file: string,
    args: string[],
    _options: unknown,
    done: Function,
  ) => {
    if (fail) done(new Error("spawn"), "");
    else done(null, args.length === 1 ? `${node}\n` : `${npm}\n`);
  }) as unknown as typeof execFile;
}

test("node resolves with the npm CLI beside it, outside every workspace root", async () => {
  const { base, bin, workspace } = await install();
  try {
    const found = await resolveNode(undefined, [workspace], bin);
    assert.equal(found.path, join(bin, "node"));
    assert.equal(
      found.npm?.path,
      join(base, "lib/node_modules/npm/bin/npm-cli.js"),
    );
    assert.ok(Object.isFrozen(found));
    // An override names node itself; npm is still taken from its directory.
    assert.equal(
      (await resolveNode(join(bin, "node"), [workspace], "")).npm?.path,
      found.npm?.path,
    );
    // npm inside a workspace root is refused.
    await assert.rejects(
      resolveNode(undefined, [base], bin),
      /EXECUTABLE_REFUSED/,
    );
  } finally {
    await rm(base, { recursive: true });
  }
});

test("an npm that is not npm's CLI script, or is missing, refuses node", async () => {
  for (const target of ["other.js", "missing.js", "lib/node_modules/npm/bin"]) {
    const { base, bin, workspace } = await install(target);
    try {
      await assert.rejects(
        resolveNode(undefined, [workspace], bin),
        /EXECUTABLE_REFUSED/,
      );
    } finally {
      await rm(base, { recursive: true });
    }
  }
});

test("only Node 24 from 24.22.1 with npm 11 is accepted", async () => {
  const { base, bin, workspace } = await install();
  try {
    const found = await resolveNode(undefined, [workspace], bin);
    for (const [node, npm] of [
      ["v24.22.1", "11.19.1"],
      ["v24.22.10", "11.0.0"],
      ["v24.30.0", "11.6.2"],
    ] as const)
      assert.equal(await verifyNode(found, runner(node, npm)), npm);
    for (const [node, npm] of [
      ["v24.22.0", "11.19.1"],
      ["v24.21.9", "11.19.1"],
      ["v26.12.1", "11.19.1"],
      ["v22.23.4", "11.19.1"],
      ["24.22.1", "11.19.1"],
      ["v24.22.1", "10.9.2"],
      ["v24.22.1", "11.19"],
    ] as const)
      await assert.rejects(
        verifyNode(found, runner(node, npm)),
        /EXECUTABLE_REFUSED/,
      );
    await assert.rejects(
      verifyNode(found, runner("v24.22.1", "11.19.1", true)),
      /EXECUTABLE_REFUSED/,
    );
    const { npm: _npm, ...withoutNpm } = found;
    await assert.rejects(
      verifyNode(withoutNpm, runner("v24.22.1", "11.19.1")),
      /EXECUTABLE_REFUSED/,
    );
    // A replaced npm or node between resolution and launch is refused.
    await utimes(found.npm!.path, new Date(), new Date(Date.now() + 5000));
    await assert.rejects(
      verifyNode(found, runner("v24.22.1", "11.19.1")),
      /EXECUTABLE_REFUSED/,
    );
    const again = await resolveNode(undefined, [workspace], bin);
    await utimes(again.path, new Date(), new Date(Date.now() + 9000));
    await assert.rejects(
      verifyNode(again, runner("v24.22.1", "11.19.1")),
      /EXECUTABLE_REFUSED/,
    );
  } finally {
    await rm(base, { recursive: true });
  }
});

test("the real node on PATH verifies", async () => {
  const found = await resolveNode(undefined, [resolve(".tmp")]);
  assert.match(await verifyNode(found), /^11\./);
});
