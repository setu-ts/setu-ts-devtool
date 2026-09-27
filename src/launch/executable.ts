import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, delimiter, join, dirname } from "node:path";
import { execFile } from "node:child_process";
export interface Executable {
  readonly path: string;
  readonly identity: string;
  readonly pathValue: string;
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
    : directories.map((dir) => join(dir, "deno"))) {
    try {
      const path = await realpath(candidate);
      if (roots.some((root) => inside(path, root))) continue;
      const value = await identity(path);
      return Object.freeze({
        path,
        identity: value,
        pathValue: [dirname(path), ...directories].join(delimiter),
      });
    } catch {
      /* Try the next host PATH candidate. */
    }
  }
  throw new Error("EXECUTABLE_REFUSED");
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
