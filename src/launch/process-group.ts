import { opendir, readFile } from "node:fs/promises";
export interface ProcessIdentity {
  readonly pid: number;
  readonly group: number;
  readonly session: number;
  readonly start: string;
  readonly zombie: boolean;
}
export function parseStat(text: string): ProcessIdentity {
  const end = text.lastIndexOf(")");
  const pid = Number(text.slice(0, text.indexOf(" ")));
  const fields = text.slice(end + 2).split(" ");
  const group = Number(fields[2]),
    session = Number(fields[3]),
    start = fields[19];
  if (
    end < 0 ||
    !Number.isSafeInteger(pid) ||
    pid < 1 ||
    !Number.isSafeInteger(group) ||
    group < 0 ||
    !Number.isSafeInteger(session) ||
    session < 0 ||
    !start ||
    !/^\d+$/.test(start)
  )
    throw new Error("GROUP_UNKNOWN");
  return {
    pid,
    group,
    session,
    start,
    zombie: fields[0] === "Z" || fields[0] === "X",
  };
}
export async function processIdentity(pid: number): Promise<ProcessIdentity> {
  return parseStat(await readFile(`/proc/${pid}/stat`, "utf8"));
}
export function processVanished(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ESRCH")
  );
}
export function terminateUnknownGroup(
  signal: (pid: number, name: NodeJS.Signals) => unknown,
  exit: (code: number) => never,
): never {
  try {
    signal(0, "SIGKILL");
  } finally {
    exit(1);
  }
}
export async function liveMembers(
  group: number,
  session: number,
): Promise<number[]> {
  const found: number[] = [];
  const started = performance.now();
  let count = 0;
  for await (const entry of await opendir("/proc")) {
    if (++count > 65536 || performance.now() - started > 1000)
      throw new Error("GROUP_UNKNOWN");
    if (!/^\d+$/.test(entry.name)) continue;
    try {
      const record = await processIdentity(Number(entry.name));
      if (
        record.group === group &&
        record.session === session &&
        !record.zombie
      )
        found.push(record.pid);
    } catch (error) {
      if (!processVanished(error)) throw new Error("GROUP_UNKNOWN");
    }
  }
  return found;
}
