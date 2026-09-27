import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createHash } from "node:crypto";
const provenance = JSON.parse(
  await readFile(".tmp/artifacts/provenance.json", "utf8"),
);
const pin = JSON.parse(await readFile("scripts/framework-pin.json", "utf8"));
if (provenance.commit !== pin.commit)
  throw new Error("Prepare the pinned framework artifacts before building");
for (const [file, key] of [
  ["client.cjs", "clientSha256"],
  ["recipes.json", "recipesSha256"],
]) {
  if (
    createHash("sha256")
      .update(await readFile(".tmp/artifacts/" + file))
      .digest("hex") !== provenance[key]
  )
    throw new Error("Framework artifact integrity mismatch");
}
const alias = {
  "@setu-ts/common": new URL(
    "../.tmp/framework/packages/common/src/index.ts",
    import.meta.url,
  ).pathname,
  "@setu-ts/diagnostics-plugin": new URL(
    "../.tmp/artifacts/client.cjs",
    import.meta.url,
  ).pathname,
};
const tests = process.argv.includes("--tests");
const dev = process.argv.includes("--dev");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const extension = await build({
  metafile: true,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  alias,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  target: "node24",
  external: ["vscode"],
  define: { __DEV__: String(dev) },
  minify: !dev,
  sourcemap: dev,
});
for (const output of Object.values(extension.metafile.outputs)) {
  if (
    output.imports.some(
      ({ path }) => path !== "vscode" && !path.startsWith("node:"),
    )
  )
    throw new Error("Unexpected runtime dependency in extension bundle");
}

if (tests) {
  const entries = (await readdir("test/unit"))
    .filter((p) => p.endsWith(".test.ts"))
    .map((p) => `test/unit/${p}`);
  await build({
    entryPoints: entries,
    outdir: "out/unit",
    outExtension: { ".js": ".cjs" },
    sourcemap: true,
    bundle: true,
    alias: {
      ...alias,
      vscode: new URL("../test/fixtures/vscode.ts", import.meta.url).pathname,
    },
    define: { __DEV__: "true" },
    platform: "node",
    mainFields: ["module", "main"],
    target: "node24",
    format: "cjs",
  });
}
await build({
  entryPoints: ["test/host/index.ts"],
  outfile: "out/host/index.cjs",
  bundle: true,
  alias,
  platform: "node",
  mainFields: ["module", "main"],
  target: "node24",
  format: "cjs",
  external: ["vscode"],
});

if (!dev) {
  const bundle = await readFile("dist/extension.cjs", "utf8");
  if (bundle.includes("SAMPLE DATA") || bundle.includes("setuDevtool.sample"))
    throw new Error("Development fixture leaked into production bundle");
}

const supervisor = await build({
  metafile: true,
  entryPoints: ["src/launch/supervisor.ts"],
  outfile: "dist/supervisor.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
});
for (const output of Object.values(supervisor.metafile.outputs))
  if (output.imports.some(({ path }) => !path.startsWith("node:")))
    throw new Error("Unexpected runtime dependency in supervisor bundle");

if (process.argv.includes("--integration"))
  await build({
    entryPoints: (await readdir("test/integration"))
      .filter((p) => p.endsWith(".test.ts"))
      .map((p) => "test/integration/" + p),
    outdir: "out/integration",
    outExtension: { ".js": ".cjs" },
    sourcemap: true,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    mainFields: ["module", "main"],
    alias,
  });

await writeFile(
  "dist/THIRD_PARTY_NOTICES.txt",
  "Setu-TS (" +
    pin.commit +
    ")\n" +
    (await readFile(".tmp/framework/LICENSE", "utf8")) +
    "\njsonc-parser\n" +
    (await readFile("node_modules/jsonc-parser/LICENSE.md", "utf8")),
);
