import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
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
    contents: `export { renderDevEntry } from './packages/cli/src/devtool/dev-entry.ts'; export { workspaceDevRunner } from './packages/cli/src/workspace/dev-runner.ts'; export { workspaceProfile } from './packages/cli/src/workspace/runtime-profile.ts'; export { devtoolTasks } from './packages/cli/src/templates/project-files.ts'; export { FUNCTIONAL_MODULE_MANIFEST } from './packages/cli/src/templates/module-seam.ts';`,
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
const profile = generator.workspaceProfile("deno");
const recipes = {
  commit: pin.commit,
  standalone: variants(generator.renderDevEntry({ devtoolPort: 49191 })),
  member: variants(
    generator.renderDevEntry({
      devtoolPort: 49191,
      port: { symbol: "SERVICE_PORT", from: "./src/discovery/services.ts" },
    }),
  ),
  runner: variants(generator.workspaceDevRunner(profile).contents),
  rootTask: profile.runAll,
  tasks: [
    generator.devtoolTasks().dev,
    generator.devtoolTasks(generator.FUNCTIONAL_MODULE_MANIFEST).dev,
  ],
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
