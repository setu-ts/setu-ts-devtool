import catalog from "../../.tmp/artifacts/recipes.json";
const normalize = (text: string) => text.replace(/\r\n/g, "\n");
export function entryMatches(
  text: string,
  port: number,
  member: boolean,
  runtime: "deno" | "node" = "deno",
): boolean {
  const source = runtime === "node" ? catalog.node : catalog;
  return (member ? source.member : source.standalone).some(
    (template) =>
      template.replace("port: 49191,", `port: ${port},`) === normalize(text),
  );
}
export function runnerMatches(
  text: string,
  runtime: "deno" | "node" = "deno",
): boolean {
  return (runtime === "node" ? catalog.node : catalog).runner.includes(
    normalize(text),
  );
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
/** Node `package.json` scripts: the selected `dev`, a sibling's `start:dev`. */
export function scriptMatches(value: unknown, development: boolean): boolean {
  return development
    ? value === catalog.node.devScript
    : typeof value === "string" && catalog.node.siblingScripts.includes(value);
}
export const rootTask = catalog.rootTask;
export const rootScript = catalog.node.rootScript;
