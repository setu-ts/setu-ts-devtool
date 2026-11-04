import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat } from "node:fs/promises";
import { relative, join, dirname } from "node:path";
import { discover, type Project } from "../discovery/discover";
import { exists, readFile } from "../discovery/files";
import { readJson, object } from "../discovery/json";
import {
  entryMatches,
  runnerMatches,
  taskMatches,
  scriptMatches,
  rootTask,
  rootScript,
} from "./recipes";
export interface LaunchDescriptor {
  readonly root: string;
  readonly directory: string;
  readonly member: string | null;
  readonly port: number;
  readonly members: readonly string[];
  readonly fingerprint: string;
  readonly runtime: "deno" | "node";
}
/**
 * npm settings that choose which package's script runs. A project `.npmrc`
 * carrying one, directly or through another config file, could hand the
 * session to an unchecked `dev` script (D06 review F1). `--no-workspaces`
 * covers the launch itself; the workspace runner's nested `npm` cannot take
 * that flag, so these keys are refused wherever npm reads project config.
 */
const REDIRECTING_NPM_KEYS = new Set([
  "workspace",
  "workspaces",
  "include-workspace-root",
  "userconfig",
  "globalconfig",
]);
/**
 * A key npm reads exactly as written. npm expands `${VAR}` in keys,
 * JSON-decodes quoted keys and nests `[section]` lines, so any key outside this
 * set could become a refused one at run time (D06 re-review F1).
 */
const PLAIN_KEY = /^[A-Za-z0-9@:/._-]+$/;
export function redirectsNpm(npmrc: string): boolean {
  // ini splits on any run of CR or LF, a lone CR included.
  return npmrc.split(/[\r\n]+/).some((raw) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";"))
      return false;
    const key = (line.includes("=") ? line.slice(0, line.indexOf("=")) : line)
      .trim()
      .replace(/\[\]$/, "");
    if (!PLAIN_KEY.test(key)) return true;
    return REDIRECTING_NPM_KEYS.has(key.toLowerCase().replace(/_/g, "-"));
  });
}
/**
 * `npm run` puts `node_modules/.bin` of the package directory and of every
 * directory above it, up to `/`, ahead of the verified node on `PATH`. The
 * chain looks up `node` (root script, tsx's `env node`), `npm` (the workspace
 * runner) and `tsx` by name, so a directory above the launch root could
 * supply an unverified one that receives the session key (D06 review F7).
 * `tsx` must resolve inside the root; `node` and `npm` must not exist above it.
 */
async function shadowedAboveRoot(root: string): Promise<boolean> {
  try {
    await access(join(root, "node_modules", ".bin", "tsx"), constants.X_OK);
  } catch {
    return true;
  }
  let directory = root;
  do {
    directory = dirname(directory);
    for (const name of ["node", "npm"])
      try {
        await lstat(join(directory, "node_modules", ".bin", name));
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") return true;
      }
  } while (dirname(directory) !== directory);
  return false;
}
export async function prepareLaunch(
  project: Project,
  port: number,
): Promise<LaunchDescriptor> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PREPARATION_FAILED");
  const current = await discover([project.root]);
  const selected = current.projects.find(
    (p) => p.directory === project.directory && p.member === project.member,
  );
  if (
    current.issues.length ||
    !selected ||
    (selected.member !== null && selected.diagnosticsPort !== port)
  )
    throw new Error("PREPARATION_FAILED");
  const hash = createHash("sha256");
  const read = async (path: string): Promise<string> => {
    const text = await readFile(project.root, path);
    if (text === undefined) throw new Error("PREPARATION_FAILED");
    hash.update(JSON.stringify([path, text]));
    return text;
  };
  const config = async (directory: string) => {
    const path = relative(project.root, directory);
    const first = await readFile(project.root, join(path, "deno.json"));
    const second = await readFile(project.root, join(path, "deno.jsonc"));
    if ((first === undefined) === (second === undefined))
      throw new Error("PREPARATION_FAILED");
    return readJson(
      await read(join(path, first === undefined ? "deno.jsonc" : "deno.json")),
      true,
    );
  };
  const runtime = selected.runtime;
  const scripts = async (directory: string) => {
    const path = join(relative(project.root, directory), "package.json");
    return object(readJson(await read(path), false).scripts);
  };
  if (runtime === "node") {
    // Project config npm reads: the root, and each member for completeness.
    for (const directory of [
      project.root,
      ...current.projects.map((p) => p.directory),
    ]) {
      const path = join(relative(project.root, directory), ".npmrc");
      if ((await exists(project.root, path)) && redirectsNpm(await read(path)))
        throw new Error("PREPARATION_FAILED");
    }
    if (project.member !== null) {
      await read("setu.workspace.json");
      const manifest = readJson(await read("package.json"), false);
      // The runner's nested `npm run dev` has no --no-workspaces: npm walks up
      // from the member to the first package.json whose workspaces include
      // it and loads that directory's .npmrc (D06 re-review A). Members live
      // in apps/<name>, so the walk must end at the root: `apps/*` listed, no
      // `!` negation that could drop a member (A1), and no package.json in
      // apps/ to end it early (A2).
      const workspaces = manifest.workspaces;
      if (
        object(manifest.scripts).dev !== rootScript ||
        !Array.isArray(workspaces) ||
        !workspaces.includes("apps/*") ||
        workspaces.some((e) => typeof e !== "string" || e.includes("!")) ||
        (await exists(project.root, join("apps", "package.json"))) ||
        (await exists(project.root, join("apps", ".npmrc"))) ||
        !runnerMatches(await read("scripts/dev.mjs"), "node")
      )
        throw new Error("PREPARATION_FAILED");
    }
    // npm_config_ignore_scripts stops pre/post scripts, so only the named
    // script is compared. The devtool never installs: tsx must be present at
    // the root, where every member's and sibling's lookup reaches it before
    // any directory above the root.
    if (
      !(await exists(
        project.root,
        join("node_modules", "tsx", "package.json"),
      )) ||
      (await shadowedAboveRoot(project.root))
    )
      throw new Error("PREPARATION_FAILED");
  } else if (project.member !== null) {
    await read("setu.workspace.json");
    const root = await config(project.root);
    const tasks = object(root.tasks);
    if (
      tasks.dev !== rootTask ||
      tasks.predev !== undefined ||
      tasks.postdev !== undefined ||
      !runnerMatches(await read("scripts/dev.ts"))
    )
      throw new Error("PREPARATION_FAILED");
  }
  for (const member of current.projects) {
    const chosen = member.directory === selected.directory;
    if (runtime === "node") {
      const values = await scripts(member.directory);
      if (!scriptMatches(values[chosen ? "dev" : "start:dev"], chosen))
        throw new Error("PREPARATION_FAILED");
    }
    const tasks =
      runtime === "node" ? {} : object((await config(member.directory)).tasks);
    if (
      (runtime === "deno" &&
        !taskMatches(tasks[chosen ? "dev" : "start"], chosen)) ||
      tasks.predev !== undefined ||
      tasks.postdev !== undefined ||
      tasks.prestart !== undefined ||
      tasks.poststart !== undefined
    )
      throw new Error("PREPARATION_FAILED");
    if (
      chosen &&
      !entryMatches(
        await read(
          join(relative(project.root, member.directory), "main.dev.ts"),
        ),
        port,
        member.member !== null,
        runtime,
      )
    )
      throw new Error("PREPARATION_FAILED");
    if (member.member !== null)
      await read(
        join(
          relative(project.root, member.directory),
          "src/discovery/services.ts",
        ),
      );
  }
  return Object.freeze({
    root: project.root,
    directory: selected.directory,
    member: selected.member,
    port,
    members: Object.freeze(current.projects.map((p) => p.label)),
    fingerprint: hash.digest("hex"),
    runtime,
  });
}
