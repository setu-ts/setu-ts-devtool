import catalog from "../../.tmp/artifacts/recipes.json";
export function entryMatches(
  text: string,
  port: number,
  member: boolean,
): boolean {
  return (member ? catalog.member : catalog.standalone).some(
    (template) =>
      template.replace("port: 49191,", `port: ${port},`) ===
      text.replace(/\r\n/g, "\n"),
  );
}
export function runnerMatches(text: string): boolean {
  return catalog.runner.includes(text.replace(/\r\n/g, "\n"));
}
export function taskMatches(value: unknown, development: boolean): boolean {
  return (
    typeof value === "string" &&
    catalog.tasks.some(
      (task) =>
        (development ? task : task.replace("main.dev.ts", "main.ts")) === value,
    )
  );
}
export const rootTask = catalog.rootTask;
