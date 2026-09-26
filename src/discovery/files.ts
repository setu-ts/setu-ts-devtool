import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_BYTES } from "./json";
function missing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
export async function canonicalRoot(path: string): Promise<string> {
  const root = await realpath(path);
  if (!(await lstat(root)).isDirectory()) throw new Error("INVALID_PROJECT");
  return root;
}
export async function safePath(root: string, path: string): Promise<string> {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("INVALID_PROJECT");
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error("INVALID_PROJECT");
  }
  return target;
}
export async function readFile(
  root: string,
  path: string,
): Promise<string | undefined> {
  try {
    const target = await safePath(root, path);
    const file = await open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error("INVALID_PROJECT");
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let size = 0;
      while (size <= MAX_BYTES) {
        const read = await file.read(buffer, size, buffer.length - size, null);
        if (read.bytesRead === 0) break;
        size += read.bytesRead;
      }
      if (size > MAX_BYTES) throw new Error("INVALID_PROJECT");
      return new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, size),
      );
    } finally {
      await file.close();
    }
  } catch (error) {
    if (missing(error)) return undefined;
    throw new Error("INVALID_PROJECT");
  }
}
