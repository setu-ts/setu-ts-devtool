import { test } from "node:test";
import assert from "node:assert/strict";
import type * as VSCode from "vscode";
import { resolve, join } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { activate, deactivate } from "../../src/extension";
import * as editor from "../fixtures/vscode";
import { preparedProject } from "../fixtures/projects";
function context() {
  const subscriptions: { dispose(): unknown }[] = [];
  return {
    subscriptions,
    extensionPath: resolve("."),
    extensionMode: 3,
  } as unknown as VSCode.ExtensionContext;
}
async function select(api: ReturnType<typeof activate>) {
  await editor.commands.executeCommand("setuDevtool.refresh");
  await editor.commands.executeCommand(
    "setuDevtool.select",
    api.projectIds()[0],
  );
}
test("native launch confirms full workspace scope, ignores workspace executable overrides and stops on removal", async () => {
  const fixture = await preparedProject(true),
    ctx = context();
  editor.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: fixture.root } },
  ];
  const api = activate(ctx);
  try {
    await select(api);
    editor.state.confirmation = "Launch";
    await editor.commands.executeCommand("setuDevtool.launch");
    assert.ok(editor.state.details.at(-1)?.includes("api, worker"));
    await editor.commands.executeCommand("setuDevtool.sample");
    assert.ok(api.rows().includes("api"));
    await editor.commands.executeCommand("setuDevtool.select", "invalid");
    await editor.commands.executeCommand("setuDevtool.clear");
    editor.workspace.workspaceFolders = [
      { uri: { scheme: "file", fsPath: join(fixture.root, "missing") } },
      { uri: { scheme: "file", fsPath: fixture.root } },
    ];
    editor.workspaceChanged.fire();
    await delay(40);
    editor.workspace.workspaceFolders = [];
    editor.workspaceChanged.fire();
    await delay(200);
    await editor.commands.executeCommand("setuDevtool.stop");
    await editor.commands.executeCommand("setuDevtool.recheckCleanup");
    assert.equal(editor.state.errors.length, 0);
  } finally {
    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("standalone confirmation cancels, detects changed recipes and requires an explicitly chosen port", async () => {
  const fixture = await preparedProject(),
    ctx = context();
  editor.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: fixture.root } },
  ];
  const api = activate(ctx);
  const previous = process.env.PORT;
  process.env.PORT = String(fixture.appPort);
  try {
    await editor.commands.executeCommand("setuDevtool.launch");
    assert.ok(editor.state.errors.length > 0);
    editor.state.errors = [];
    await select(api);
    editor.state.input = undefined;
    await editor.commands.executeCommand("setuDevtool.launch");
    assert.ok(editor.state.inputCheck?.("bad"));
    assert.ok(editor.state.inputCheck?.("1"));
    assert.ok(editor.state.inputCheck?.("65536"));
    assert.equal(editor.state.inputCheck?.("4919"), undefined);
    editor.state.input = String(fixture.port);
    editor.state.confirmation = undefined;
    await editor.commands.executeCommand("setuDevtool.launch");
    assert.equal(editor.state.errors.length, 0);
    const path = join(fixture.root, "deno.json"),
      text = await readFile(path, "utf8");
    editor.state.confirmation = "Launch";
    editor.state.onConfirm = () => writeFile(path, text + " ");
    await editor.commands.executeCommand("setuDevtool.launch");
    assert.equal(editor.state.errors.length, 1);
    await writeFile(path, text);
    editor.state.onConfirm = async () => {};
    editor.state.errors = [];
    await editor.commands.executeCommand("setuDevtool.launch");
    await editor.commands.executeCommand("setuDevtool.clear");
    await editor.commands.executeCommand("setuDevtool.stop");
    assert.equal(editor.state.errors.length, 0);
    editor.state.onConfirm = async () => {
      editor.workspace.isTrusted = false;
    };
    await editor.commands.executeCommand("setuDevtool.launch");
    editor.workspace.isTrusted = true;
    editor.state.onConfirm = async () => {};
  } finally {
    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
    editor.workspace.isTrusted = true;
    editor.state.onConfirm = async () => {};
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("editor discovery and direct commands refuse unsupported contexts, samples stay explicit", async () => {
  const fixture = await preparedProject(true),
    ctx = context();
  editor.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: fixture.root } },
  ];
  const api = activate(ctx);
  try {
    editor.workspace.isTrusted = false;
    for (const name of ["refresh", "launch", "select", "sample"])
      await editor.commands.executeCommand("setuDevtool." + name);
    assert.equal(api.projectIds().length, 0);
    editor.workspace.isTrusted = true;
    editor.env.remoteName = "ssh";
    await editor.commands.executeCommand("setuDevtool.refresh");
    assert.equal(api.projectIds().length, 0);
    editor.env.remoteName = undefined;
    await select(api);
    await editor.commands.executeCommand("setuDevtool.select");
    assert.ok(api.selected());
    editor.state.pick = false;
    await editor.commands.executeCommand("setuDevtool.select");
    editor.state.pick = true;
    await editor.commands.executeCommand("setuDevtool.sample");
    assert.match(api.rows()[0]!, /SAMPLE/);
    editor.fileChanged.fire();
    editor.visibility.fire({ visible: true });
    await editor.commands.executeCommand("setuDevtool.refresh");
    assert.ok(api.rows().includes("api"));
    editor.fileChanged.fire();
    editor.fileChanged.fire();
    await delay(300);
    editor.visibility.fire({ visible: false });
    editor.visibility.fire({ visible: true });
    await delay(40);
    editor.workspace.workspaceFolders = [];
    editor.workspaceChanged.fire();
    await editor.commands.executeCommand("setuDevtool.refresh");
    assert.equal(api.projectIds().length, 0);
  } finally {
    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    editor.fileChanged.fire();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("discovery failures, lost trust during scan, and missing tasks clear native rows safely", async () => {
  const fixture = await preparedProject(true),
    ctx = context();
  editor.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: fixture.root } },
  ];
  const api = activate(ctx);
  try {
    editor.state.watchError = true;
    await editor.commands.executeCommand("setuDevtool.refresh");
    assert.match(api.rows()[0]!, /failed/);
    editor.state.watchError = false;
    const refreshing = editor.commands.executeCommand("setuDevtool.refresh");
    editor.workspace.isTrusted = false;
    await refreshing;
    assert.equal(api.projectIds().length, 0);
    editor.workspace.isTrusted = true;
    await writeFile(
      join(fixture.root, "apps/api/deno.json"),
      JSON.stringify({ tasks: {} }),
    );
    await editor.commands.executeCommand("setuDevtool.refresh");
    assert.ok(api.projectIds().length);
    const pending = editor.commands.executeCommand("setuDevtool.select");
    editor.workspace.isTrusted = false;
    await pending;
    assert.equal(api.selected(), undefined);
    editor.workspace.isTrusted = true;
    editor.fileChanged.fire();
    editor.workspaceChanged.fire();
    await delay(20);
    editor.fileChanged.fire();
    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
  } finally {
    editor.workspace.isTrusted = true;
    editor.state.watchError = false;
    await deactivate();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("production activation in an empty window exposes no sample command or project", async () => {
  const ctx = { ...context(), extensionMode: editor.ExtensionMode.Production };
  const previous = editor.workspace.workspaceFolders;
  Reflect.deleteProperty(editor.workspace, "workspaceFolders");
  const api = activate(ctx);
  try {
    assert.equal(
      (await editor.commands.getCommands()).includes("setuDevtool.sample"),
      false,
    );
    await editor.commands.executeCommand("setuDevtool.refresh");
    await editor.commands.executeCommand("setuDevtool.select", {});
    await editor.commands.executeCommand("setuDevtool.select");
    editor.workspaceChanged.fire();
    assert.equal(api.projectIds().length, 0);
  } finally {
    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    editor.workspace.workspaceFolders = previous;
  }
});
