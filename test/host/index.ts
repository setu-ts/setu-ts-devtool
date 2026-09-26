import * as vscode from "vscode";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
interface ExtensionApi {
  rows(): readonly string[];
  projectIds(): readonly string[];
  selected(): string | undefined;
}
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(
    "setu-ts.setu-ts-devtool",
  );
  assert.ok(extension);
  if (process.env.SETU_HOST_RESTRICTED === "1") {
    assert.equal(vscode.workspace.isTrusted, false);
    try {
      await vscode.commands.executeCommand("setuDevtool.refresh");
    } catch {
      /* Refused activation is expected. */
    }
    // Development hosts may activate an extension despite the manifest restriction.
    // Its command-level gate must still refuse discovery.
    if (extension.isActive) {
      const api = extension.exports;
      assert.deepEqual(api.projectIds(), []);
      assert.equal(api.selected(), undefined);
      assert.ok(api.rows()[0]?.toLowerCase().includes("trust"));
    }
  } else {
    assert.equal(vscode.workspace.isTrusted, true);
    const api = await extension.activate();
    await vscode.commands.executeCommand("setuDevtool.refresh");
    assert.ok(api.rows().includes("api"));
    await vscode.commands.executeCommand(
      "setuDevtool.select",
      "arbitrary-path-or-command",
    );
    assert.equal(api.selected(), undefined);
    const id = api.projectIds()[0];
    assert.ok(id);
    await vscode.commands.executeCommand("setuDevtool.select", id);
    assert.equal(api.selected(), id);
    await vscode.commands.executeCommand("setuDevtool.refresh");
    assert.equal(api.selected(), undefined);
    await vscode.commands.executeCommand("setuDevtool.select", id);
    assert.equal(api.selected(), undefined);
    const commands = await vscode.commands.getCommands(true);
    if (process.env.SETU_HOST_PRODUCTION === "1") {
      assert.equal(commands.includes("setuDevtool.sample"), false);
    } else {
      assert.equal(commands.includes("setuDevtool.sample"), true);
      await vscode.commands.executeCommand("setuDevtool.sample");
      assert.ok(api.rows()[0]?.startsWith("SAMPLE DATA"));
      await vscode.commands.executeCommand("setuDevtool.refresh");
      assert.ok(api.rows().includes("api"));
    }
  }
  const evidence = {
    editor: vscode.version,
    appName: vscode.env.appName,
    node: process.versions.node,
    electron: process.versions.electron,
    platform: process.platform,
    trusted: vscode.workspace.isTrusted,
    mode:
      process.env.SETU_HOST_RESTRICTED === "1"
        ? "restricted"
        : process.env.SETU_HOST_PRODUCTION === "1"
          ? "production-bundle"
          : "development",
    passed: true,
  };
  assert.ok(process.env.SETU_HOST_EVIDENCE);
  await writeFile(
    process.env.SETU_HOST_EVIDENCE,
    JSON.stringify(evidence, null, 2),
  );
}
