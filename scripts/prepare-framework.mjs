import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { preparedFrameworkSha256 } from "./framework-integrity.mjs";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: npm run prepare:framework -- <clean framework checkout>",
  );
const pin = JSON.parse(await readFile("scripts/framework-pin.json", "utf8"));
if (
  !execFileSync("deno", ["--version"], { encoding: "utf8" }).startsWith(
    "deno " + pin.deno + " ",
  )
)
  throw new Error("Prepare with the qualified Deno version");
const git = (...args) =>
  execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
if (git("rev-parse", "HEAD") !== pin.commit || git("status", "--porcelain"))
  throw new Error("Framework must be clean at the pinned commit");
const archive = execFileSync(
  "git",
  ["archive", "HEAD", "packages", "tsconfig.base.json", "LICENSE"],
  { cwd: source, maxBuffer: 128 * 1024 * 1024 },
);
const root = resolve(".tmp/framework");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
execFileSync("tar", ["-xf", "-", "-C", root], { input: archive });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
await mkdir(".tmp/artifacts", { recursive: true });
const alias = { "@setu-ts/common": `${root}/packages/common/src/index.ts` };
await build({
  stdin: {
    contents: `export { createDiagnosticsClient } from ${JSON.stringify(root + "/packages/diagnostics-plugin/src/index.ts")};`,
    resolveDir: root,
  },
  outfile: ".tmp/artifacts/client.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  alias,
});
await build({
  stdin: {
    contents: `export { renderDevEntry } from './packages/cli/src/devtool/dev-entry.ts'; export { workspaceDevRunner } from './packages/cli/src/workspace/dev-runner.ts'; export { workspaceProfile } from './packages/cli/src/workspace/runtime-profile.ts'; export { devtoolTasks } from './packages/cli/src/templates/project-files.ts'; export { FUNCTIONAL_MODULE_MANIFEST } from './packages/cli/src/templates/module-seam.ts'; export { NODE_DEVTOOL_DEV_SCRIPT } from './packages/cli/src/devtool/npm-manifest.ts'; export { TEMPLATES } from './packages/cli/src/constants.ts';`,
    resolveDir: root,
  },
  outfile: ".tmp/artifacts/generator.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  alias,
});
const generator = await import(
  pathToFileURL(resolve(".tmp/artifacts/generator.mjs")).href
);
const normalize = (text) => text.replace(/\r\n/g, "\n");
const format = (text) =>
  execFileSync(
    "deno",
    [
      "fmt",
      "--no-config",
      "--single-quote",
      "--line-width",
      "100",
      "--ext",
      "ts",
      "-",
    ],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
  );
const variants = (text) => [
  ...new Set([normalize(text), normalize(format(text))]),
];
for (const name of ["NODE_DEVTOOL_DEV_SCRIPT", "TEMPLATES"])
  if (generator[name] === undefined)
    throw new Error(`The pinned CLI does not export ${name}`);
const profile = generator.workspaceProfile("deno");
const nodeProfile = generator.workspaceProfile("node");
// Node recipes are read from what the CLI bundled from this commit writes. It
// formats every file with Prettier, so the render alone is not the file, and a
// sibling's `start:dev` depends on its template, which the CLI renders
// privately. The CLI must format with the Prettier version the framework locks.
const lockedPrettier = /^ {2}prettier@([0-9][^:(]*):/m.exec(
  await readFile(resolve(source, "pnpm-lock.yaml"), "utf8"),
)?.[1];
const formatter = JSON.parse(
  await readFile("node_modules/prettier-framework/package.json", "utf8"),
).version;
if (lockedPrettier !== formatter)
  throw new Error(
    `The framework locks prettier ${lockedPrettier}; prettier-framework is ${formatter}`,
  );
const cliRoot = resolve(".tmp/artifacts/cli");
await rm(cliRoot, { recursive: true, force: true });
await mkdir(`${cliRoot}/node_modules`, { recursive: true });
await symlink(
  resolve("node_modules/prettier-framework"),
  `${cliRoot}/node_modules/prettier`,
);
await build({
  entryPoints: [root + "/packages/cli/src/bin.ts"],
  outfile: `${cliRoot}/cli.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  alias: {
    ...alias,
    "@setu-ts/runtime": `${root}/packages/runtime/src/index.ts`,
  },
  external: ["esbuild", "prettier", "tsx", "@hono/node-server", "ws"],
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  logLevel: "error",
});
const scratch = resolve(".tmp/artifacts/node-templates");
await rm(scratch, { recursive: true, force: true });
await mkdir(scratch, { recursive: true });
const cli = (...args) =>
  execFileSync(process.execPath, [`${cliRoot}/cli.mjs`, ...args], {
    cwd: scratch,
    stdio: "ignore",
    timeout: 120000,
  });
const json = async (path) =>
  JSON.parse(await readFile(`${scratch}/${path}`, "utf8"));
const text = async (path) =>
  normalize(await readFile(`${scratch}/${path}`, "utf8"));
cli(
  "new",
  "app",
  "--runtime",
  "node",
  "--devtool",
  "--devtool-port",
  "49191",
  "--yes",
  "--dir",
  ".",
);
cli("new", "ws", "--workspace", "--runtime", "node", "--yes", "--dir", ".");
cli(
  "generate",
  "app",
  "api",
  "--devtool",
  "--devtool-port",
  "49191",
  "--dir",
  "ws",
);
const siblingScripts = new Set();
for (const template of ["none", ...generator.TEMPLATES]) {
  cli(
    "generate",
    "app",
    `m-${template}`,
    ...(template === "none" ? [] : ["--template", template]),
    "--dir",
    "ws",
  );
  const script = (await json(`ws/apps/m-${template}/package.json`)).scripts?.[
    "start:dev"
  ];
  if (typeof script !== "string")
    throw new Error(`Template ${template} rendered no start:dev script`);
  siblingScripts.add(script);
}
const node = {
  standalone: [await text("app/main.dev.ts")],
  member: [await text("ws/apps/api/main.dev.ts")],
  runner: [await text("ws/scripts/dev.mjs")],
  rootScript: (await json("ws/package.json")).scripts?.dev,
  devScript: (await json("app/package.json")).scripts?.dev,
  siblingScripts: [...siblingScripts].sort(),
};
if (
  node.devScript !== generator.NODE_DEVTOOL_DEV_SCRIPT ||
  (await json("ws/apps/api/package.json")).scripts?.dev !== node.devScript ||
  node.rootScript !== nodeProfile.runAll ||
  ![...node.standalone, ...node.member].every((entry) =>
    entry.includes("\n  port: 49191, // IPv4 loopback only;"),
  )
)
  throw new Error("The pinned CLI's Node scaffold does not match its exports");
await rm(scratch, { recursive: true, force: true });
// Node test fixtures run the prepared sources under tsx; their third-party
// imports are installed once, at the versions the framework locks.
const lock = await readFile(resolve(source, "pnpm-lock.yaml"), "utf8");
const locked = (name) => {
  const escaped = name.replace(/[/@-]/g, (c) => "\\" + c);
  const version = new RegExp(`^ {2}'?${escaped}@([0-9][^:(']*)`, "m").exec(
    lock,
  )?.[1];
  if (version === undefined)
    throw new Error(`The framework lock has no ${name}`);
  return version;
};
const fixtureDeps = resolve(".tmp/node-fixture-deps");
await rm(fixtureDeps, { recursive: true, force: true });
await mkdir(fixtureDeps, { recursive: true });
await writeFile(
  `${fixtureDeps}/package.json`,
  JSON.stringify({
    private: true,
    dependencies: Object.fromEntries(
      ["hono", "@hono/node-server", "tsx"].map((name) => [name, locked(name)]),
    ),
  }),
);
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
  ],
  { cwd: fixtureDeps, stdio: "inherit", timeout: 300000 },
);
const recipes = {
  commit: pin.commit,
  standalone: variants(
    generator.renderDevEntry({ devtoolPort: 49191 }, "deno"),
  ),
  member: variants(
    generator.renderDevEntry(
      {
        devtoolPort: 49191,
        port: { symbol: "SERVICE_PORT", from: "./src/discovery/services.ts" },
      },
      "deno",
    ),
  ),
  runner: variants(generator.workspaceDevRunner(profile).contents),
  rootTask: profile.runAll,
  tasks: [
    generator.devtoolTasks().dev,
    generator.devtoolTasks(generator.FUNCTIONAL_MODULE_MANIFEST).dev,
  ],
  node,
};
await writeFile(
  ".tmp/artifacts/recipes.json",
  JSON.stringify(recipes, null, 2) + "\n",
);
await writeFile(
  ".tmp/artifacts/provenance.json",
  JSON.stringify(
    {
      commit: pin.commit,
      archiveSha256: sha256(archive),
      frameworkSha256: await preparedFrameworkSha256(root),
      clientSha256: sha256(await readFile(".tmp/artifacts/client.cjs")),
      recipesSha256: sha256(await readFile(".tmp/artifacts/recipes.json")),
      license: "MIT",
      deno: pin.deno,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared public helper and CLI recipes from ${pin.commit}`);

await writeFile(
  ".tmp/declaration-config.json",
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      allowImportingTsExtensions: true,
      declaration: true,
      emitDeclarationOnly: true,
      noCheck: true,
      rootDir: "framework/packages",
      outDir: "declarations",
      paths: {
        "@setu-ts/common": ["./framework/packages/common/src/index.ts"],
      },
    },
    files: [
      "framework/packages/common/src/index.ts",
      "framework/packages/diagnostics-plugin/src/index.ts",
    ],
  }),
);
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", ".tmp/declaration-config.json"],
  { stdio: "inherit" },
);
