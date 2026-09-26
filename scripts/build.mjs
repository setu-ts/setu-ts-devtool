import { build } from "esbuild";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
const tests = process.argv.includes("--tests");
const dev = process.argv.includes("--dev");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  mainFields: ["module", "main"],
  format: "cjs",
  target: "node24",
  external: ["vscode"],
  define: { __DEV__: String(dev) },
  minify: !dev,
  sourcemap: dev,
});
if (tests) {
  const entries = (await readdir("test/unit"))
    .filter((p) => p.endsWith(".test.ts"))
    .map((p) => `test/unit/${p}`);
  await build({
    entryPoints: entries,
    outdir: "out/unit",
    outExtension: { ".js": ".cjs" },
    bundle: true,
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
