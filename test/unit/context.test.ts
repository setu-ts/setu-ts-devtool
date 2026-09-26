import { test } from "node:test";
import assert from "node:assert/strict";
import { refusal, type HostContext } from "../../src/editor/context";
const local: HostContext = {
  trusted: true,
  desktop: true,
  remote: false,
  platform: "linux",
  schemes: ["file"],
};
test("only trusted local Linux desktop contexts are supported", () => {
  assert.equal(refusal(local), undefined);
  for (const patch of [
    { trusted: false },
    { desktop: false },
    { remote: true },
    { platform: "win32" },
    { schemes: ["file", "vscode-remote"] },
    { schemes: Array<string>(17).fill("file") },
  ]) {
    assert.equal(typeof refusal({ ...local, ...patch }), "string");
  }
});
