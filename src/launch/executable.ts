import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, delimiter, join, dirname, sep } from "node:path";
import { execFile } from "node:child_process";
import { NPM_ENVIRONMENT } from "./credentials";
export interface Executable {
  readonly path: string;
  readonly identity: string;
  readonly pathValue: string;
  /** Node only: npm's CLI script from the same directory as `node`. */
  readonly npm?: Readonly<{ path: string; identity: string }>;
}
export function inside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return !rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../"));
}
async function identity(path: string): Promise<string> {
  const value = await stat(path);
  if (!value.isFile()) throw new Error();
  await access(path, constants.X_OK);
  return `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}`;
}
export async function resolveDeno(
  override: unknown,
  roots: readonly string[],
  pathValue = process.env.PATH ?? "",
): Promise<Executable> {
  return resolveExecutable("deno", override, roots, pathValue);
}
/**
 * Node, plus the npm beside it in the same directory. The supervisor runs
 * `node <npm-cli.js>`, so the verified node is the one that runs npm.
 */
export async function resolveNode(
  override: unknown,
  roots: readonly string[],
  pathValue = process.env.PATH ?? "",
): Promise<Executable> {
  return resolveExecutable("node", override, roots, pathValue);
}
async function resolveExecutable(
  name: "deno" | "node",
  override: unknown,
  roots: readonly string[],
  pathValue: string,
): Promise<Executable> {
  if (
    override !== undefined &&
    (typeof override !== "string" || !isAbsolute(override))
  )
    throw new Error("EXECUTABLE_REFUSED");
  roots = await Promise.all(roots.map((root) => realpath(root)));
  const directories: string[] = [];
  for (const part of pathValue.split(delimiter)) {
    if (!isAbsolute(part)) continue;
    try {
      const dir = await realpath(part);
      if (!roots.some((root) => inside(dir, root))) directories.push(dir);
    } catch {
      /* Missing PATH entries are ignored. */
    }
  }
  for (const candidate of typeof override === "string"
    ? [override]
    : directories.map((dir) => join(dir, name))) {
    try {
      const path = await realpath(candidate);
      if (roots.some((root) => inside(path, root))) continue;
      const value = await identity(path);
      const npm =
        name === "node" ? await companionNpm(dirname(path), roots) : undefined;
      return Object.freeze({
        path,
        identity: value,
        pathValue: [dirname(path), ...directories].join(delimiter),
        ...(npm === undefined ? {} : { npm }),
      });
    } catch {
      /* Try the next host PATH candidate. */
    }
  }
  throw new Error("EXECUTABLE_REFUSED");
}
async function companionNpm(
  directory: string,
  roots: readonly string[],
): Promise<Readonly<{ path: string; identity: string }>> {
  const path = await realpath(join(directory, "npm"));
  if (
    roots.some((root) => inside(path, root)) ||
    !path.endsWith(`${sep}node_modules${sep}npm${sep}bin${sep}npm-cli.js`)
  )
    throw new Error();
  const value = await stat(path);
  if (!value.isFile()) throw new Error();
  return Object.freeze({
    path,
    identity: `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}`,
  });
}
export async function verifyDeno(executable: Executable): Promise<void> {
  try {
    if ((await identity(executable.path)) !== executable.identity)
      throw new Error();
    const stdout = await new Promise<string>((resolve, reject) =>
      execFile(
        executable.path,
        ["--version"],
        { timeout: 3000, maxBuffer: 4096, env: { PATH: executable.pathValue } },
        (error, out) => (error ? reject(new Error()) : resolve(out)),
      ),
    );
    if (
      !/^deno 2\.9\.6(?:\s|$)/.test(stdout) ||
      (await identity(executable.path)) !== executable.identity
    )
      throw new Error();
  } catch {
    throw new Error("EXECUTABLE_REFUSED");
  }
}
/** Node 24 from 24.22.1, the qualified line; npm 11, as Node 24 bundles. */
const NODE_VERSION = /^v24\.(2[2-9]|[3-9][0-9])\.([0-9]+)\s*$/;
export async function verifyNode(
  executable: Executable,
  run: typeof execFile = execFile,
): Promise<string> {
  try {
    const npm = executable.npm;
    if (!npm || (await identity(executable.path)) !== executable.identity)
      throw new Error();
    const version = (args: string[]) =>
      new Promise<string>((resolve, reject) =>
        run(
          executable.path,
          args,
          {
            timeout: 5000,
            maxBuffer: 4096,
            // Not the extension host's directory: npm reads a `.npmrc` there.
            cwd: dirname(npm.path),
            env: { PATH: executable.pathValue, ...NPM_ENVIRONMENT },
          },
          (error, out) => (error ? reject(new Error()) : resolve(String(out))),
        ),
      );
    const node = NODE_VERSION.exec(await version(["--version"]));
    if (!node || (node[1] === "22" && Number(node[2]) < 1)) throw new Error();
    const npmVersion = (await version([npm.path, "--version"])).trim();
    const npmFile = await stat(npm.path);
    if (
      !/^11\.[0-9]+\.[0-9]+$/.test(npmVersion) ||
      `${npmFile.dev}:${npmFile.ino}:${npmFile.size}:${npmFile.mtimeMs}` !==
        npm.identity ||
      (await identity(executable.path)) !== executable.identity
    )
      throw new Error();
    return npmVersion;
  } catch {
    throw new Error("EXECUTABLE_REFUSED");
  }
}
