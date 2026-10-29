import { randomBytes } from "node:crypto";
export function credentials(): {
  id: string;
  key: Uint8Array;
  encoded: string;
} {
  const key = randomBytes(32);
  return {
    id: randomBytes(16).toString("hex"),
    key,
    encoded: key.toString("hex"),
  };
}
/**
 * Fixed npm settings for a Node launch. Environment variables outrank a
 * project `.npmrc`, and the workspace runner's nested `npm` inherits them.
 * An empty `node_options` does not override the file (measured), a space does.
 */
export const NPM_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  npm_config_ignore_scripts: "true",
  npm_config_script_shell: "/bin/sh",
  npm_config_node_options: " ",
  npm_config_update_notifier: "false",
  npm_config_fund: "false",
  npm_config_audit: "false",
});
export function applicationEnvironment(
  pathValue: string,
  source: NodeJS.ProcessEnv = process.env,
  runtime: "deno" | "node" = "deno",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source))
    if (
      value !== undefined &&
      // npm reads its prefix in either case. Deno keeps them: it honours an
      // npm registry setting from the environment.
      !(runtime === "node" && /^npm_config_/i.test(key)) &&
      !key.startsWith("SETU_DEVTOOL_") &&
      !key.startsWith("VSCODE_") &&
      ![
        "NODE_OPTIONS",
        "NODE_PATH",
        "NODE_CHANNEL_FD",
        "NODE_CHANNEL_SERIALIZATION_MODE",
        "ELECTRON_RUN_AS_NODE",
      ].includes(key)
    )
      result[key] = value;
  result.PATH = pathValue;
  return runtime === "node" ? { ...result, ...NPM_ENVIRONMENT } : result;
}
