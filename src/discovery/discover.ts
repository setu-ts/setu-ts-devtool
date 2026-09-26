import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { canonicalRoot, readFile, safePath } from "./files";
import { object, readJson } from "./json";
export interface Project {
  readonly id: string;
  readonly label: string;
  readonly root: string;
  readonly directory: string;
  readonly member: string | null;
  readonly port: number | null;
  readonly diagnosticsPort: number | null;
  readonly task: "candidate" | "missing";
}
export interface Discovery {
  readonly projects: readonly Project[];
  readonly watchDirectories: readonly string[];
  readonly issues: readonly string[];
}
const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function port(value: unknown, minimum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 65535
  )
    throw new Error("INVALID_PROJECT");
  return value;
}
async function config(
  root: string,
  directory: string,
): Promise<Record<string, unknown> | undefined> {
  const json = await readFile(root, join(directory, "deno.json"));
  const jsonc = await readFile(root, join(directory, "deno.jsonc"));
  if (json !== undefined && jsonc !== undefined)
    throw new Error("INVALID_PROJECT");
  const text = json ?? jsonc;
  return text === undefined ? undefined : readJson(text, true);
}
function task(value: Record<string, unknown>): "candidate" | "missing" {
  if (value.tasks === undefined) return "missing";
  const tasks = object(value.tasks);
  return typeof tasks.dev === "string" && tasks.dev.length > 0
    ? "candidate"
    : "missing";
}
export async function discover(roots: readonly string[]): Promise<Discovery> {
  if (roots.length > 16)
    return {
      projects: [],
      watchDirectories: [],
      issues: ["Select at most 16 workspace folders."],
    };
  const projects: Project[] = [],
    watch = new Set<string>(),
    seen = new Set<string>(),
    issues: string[] = [];
  for (const input of roots) {
    try {
      const root = await canonicalRoot(input);
      if (seen.has(root)) continue;
      seen.add(root);
      watch.add(root);
      const text = await readFile(root, "setu.workspace.json");
      const found: Project[] = [],
        directories: string[] = [];
      if (text !== undefined) {
        const manifest = readJson(text, false);
        if (
          manifest.version !== 1 ||
          (manifest.runtime !== undefined && manifest.runtime !== "deno") ||
          !Array.isArray(manifest.members) ||
          manifest.members.length > 64
        )
          throw new Error("INVALID_PROJECT");
        port(manifest.basePort, 1);
        const names = new Set<string>(),
          ports = new Set<number>();
        const members = manifest.members.map((value: unknown) => {
          const m = object(value);
          if (
            typeof m.name !== "string" ||
            m.name.length > 64 ||
            !namePattern.test(m.name) ||
            names.has(m.name)
          )
            throw new Error("INVALID_PROJECT");
          names.add(m.name);
          const appPort = port(m.port, 1),
            diagnostic =
              m.devtoolPort === undefined ? null : port(m.devtoolPort, 1024);
          for (const n of [appPort, diagnostic])
            if (n !== null) {
              if (ports.has(n)) throw new Error("INVALID_PROJECT");
              ports.add(n);
            }
          const deps: unknown = m.dependsOn ?? [];
          if (
            !Array.isArray(deps) ||
            deps.length > 64 ||
            deps.some((d: unknown) => typeof d !== "string")
          )
            throw new Error("INVALID_PROJECT");
          return { name: m.name, appPort, diagnostic, deps: deps as string[] };
        });
        const done = new Set<string>(),
          active = new Set<string>();
        const walk = (name: string): void => {
          if (active.has(name)) throw new Error("INVALID_PROJECT");
          if (done.has(name)) return;
          const member = members.find((m) => m.name === name);
          if (!member) throw new Error("INVALID_PROJECT");
          active.add(name);
          for (const dep of member.deps) walk(dep);
          active.delete(name);
          done.add(name);
        };
        for (const m of members) walk(m.name);
        for (const m of members) {
          const relative = join("apps", m.name),
            directory = await safePath(root, relative);
          const cfg = await config(root, relative);
          if (!cfg) throw new Error("INVALID_PROJECT");
          directories.push(directory);
          found.push(
            Object.freeze({
              id: randomUUID(),
              label: m.name,
              root,
              directory,
              member: m.name,
              port: m.appPort,
              diagnosticsPort: m.diagnostic,
              task: task(cfg),
            }),
          );
        }
      } else {
        const cfg = await config(root, ".");
        if (!cfg) continue;
        const imports = cfg.imports === undefined ? {} : object(cfg.imports);
        if (
          !Object.entries(imports).some(
            ([key, value]) =>
              key.startsWith("@setu-ts/") ||
              (typeof value === "string" && value.startsWith("jsr:@setu-ts/")),
          )
        )
          continue;
        found.push(
          Object.freeze({
            id: randomUUID(),
            label:
              basename(root)
                .replace(/[\x00-\x1f\x7f]/g, "")
                .slice(0, 80) || "Setu project",
            root,
            directory: root,
            member: null,
            port: null,
            diagnosticsPort: null,
            task: task(cfg),
          }),
        );
      }
      projects.push(...found);
      for (const directory of directories) watch.add(directory);
    } catch {
      issues.push(
        "A project could not be discovered. Check its local manifest, paths and limits.",
      );
    }
  }
  return {
    projects: Object.freeze(projects),
    watchDirectories: Object.freeze([...watch]),
    issues: Object.freeze(issues),
  };
}
