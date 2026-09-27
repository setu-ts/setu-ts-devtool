import { createHash } from "node:crypto";
import { relative, join } from "node:path";
import { discover, type Project } from "../discovery/discover";
import { readFile } from "../discovery/files";
import { readJson, object } from "../discovery/json";
import { entryMatches, runnerMatches, taskMatches, rootTask } from "./recipes";
export interface LaunchDescriptor {
  readonly root: string;
  readonly directory: string;
  readonly member: string | null;
  readonly port: number;
  readonly members: readonly string[];
  readonly fingerprint: string;
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
  if (project.member !== null) {
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
    const tasks = object((await config(member.directory)).tasks);
    const chosen = member.directory === selected.directory;
    if (
      !taskMatches(tasks[chosen ? "dev" : "start"], chosen) ||
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
  });
}
