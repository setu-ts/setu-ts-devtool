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
export function applicationEnvironment(
  pathValue: string,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source))
    if (
      value !== undefined &&
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
  return result;
}
