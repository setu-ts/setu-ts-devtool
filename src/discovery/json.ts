import { parse, visit, type ParseError } from "jsonc-parser";
export const MAX_BYTES = 256 * 1024;
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("INVALID_PROJECT");
  return value as Record<string, unknown>;
}
export function readJson(
  text: string,
  comments: boolean,
): Record<string, unknown> {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("INVALID_PROJECT");
  const frames: (Set<string> | null)[] = [];
  const options = {
    disallowComments: !comments,
    allowTrailingComma: comments,
    allowEmptyContent: false,
  };
  const enter = (frame: Set<string> | null) => {
    frames.push(frame);
    if (frames.length > 32) throw new Error("INVALID_PROJECT");
  };
  visit(
    text,
    {
      onObjectBegin: () => enter(new Set()),
      onArrayBegin: () => enter(null),
      onObjectEnd: () => {
        frames.pop();
      },
      onArrayEnd: () => {
        frames.pop();
      },
      onObjectProperty: (key) => {
        const frame = frames.at(-1);
        if (!frame || frame.has(key)) throw new Error("INVALID_PROJECT");
        frame.add(key);
      },
      onError: () => {
        throw new Error("INVALID_PROJECT");
      },
    },
    options,
  );
  const errors: ParseError[] = [];
  const result: unknown = parse(text, errors, options);
  if (errors.length) throw new Error("INVALID_PROJECT");
  return object(result);
}
