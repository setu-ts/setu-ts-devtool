import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function files(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(root, path)));
    else if (entry.isFile()) found.push(path);
    else throw new Error("Prepared framework contains an unsupported entry");
  }
  return found;
}

export async function preparedFrameworkSha256(root) {
  const hash = createHash("sha256");
  for (const path of await files(root)) {
    const name = relative(root, path).split(sep).join("/"),
      content = await readFile(path);
    hash.update(String(Buffer.byteLength(name)) + ":");
    hash.update(name);
    hash.update(String(content.byteLength) + ":");
    hash.update(content);
  }
  return hash.digest("hex");
}
