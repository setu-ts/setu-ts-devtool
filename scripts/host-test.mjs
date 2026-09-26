import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(".");
await mkdir(".tmp", { recursive: true });
const directory = await mkdtemp(resolve(".tmp/host-"));
const workspace = `${directory}/workspace`;
await mkdir(`${workspace}/apps/api`, { recursive: true });
await writeFile(
  `${workspace}/setu.workspace.json`,
  JSON.stringify({
    version: 1,
    basePort: 3000,
    transport: "http",
    members: [{ name: "api", port: 3000, devtoolPort: 4919 }],
  }),
);
await writeFile(
  `${workspace}/apps/api/deno.json`,
  JSON.stringify({ tasks: { dev: "DO_NOT_EXECUTE" } }),
);
const production = process.argv.includes("--production");
const restricted = process.argv.includes("--restricted");
const executable = process.env.SETU_TEST_EDITOR ?? "code-oss";
const args = [
  "--new-window",
  "--wait",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-extensions",
  "--user-data-dir",
  `${directory}/user`,
  "--extensions-dir",
  `${directory}/extensions`,
  `--extensionDevelopmentPath=${root}`,
  `--extensionTestsPath=${root}/out/host/index.cjs`,
  workspace,
];
if (!restricted) args.unshift("--disable-workspace-trust");
// Force a fresh profile with trust enabled but no blocking trust prompt for the restricted run.
await mkdir(`${directory}/user/User`, { recursive: true });
await writeFile(
  `${directory}/user/User/settings.json`,
  JSON.stringify({
    "workspace.trust.enabled": true,
    "workspace.trust.startupPrompt": "never",
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "workbench.startupEditor": "none",
  }),
);
const evidence = `${directory}/evidence.json`;
const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("VSCODE_") && key !== "ELECTRON_RUN_AS_NODE",
  ),
);
const child = spawn(executable, args, {
  stdio: "inherit",
  env: {
    ...cleanEnvironment,
    SETU_HOST_EVIDENCE: evidence,
    SETU_HOST_PRODUCTION: production ? "1" : "0",
    SETU_HOST_RESTRICTED: restricted ? "1" : "0",
  },
});
const timer = setTimeout(() => {
  child.kill();
  process.exitCode = 1;
}, 90000);
child.on("error", () => {
  clearTimeout(timer);
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  clearTimeout(timer);
  process.exitCode = code ?? 1;
  if (code === 0) {
    try {
      const result = JSON.parse(await readFile(evidence, "utf8"));
      if (!result.passed) throw new Error();
      console.log(`Host evidence: ${evidence}`);
    } catch {
      console.error("Host did not produce passing evidence");
      process.exitCode = 1;
    }
  }
});
