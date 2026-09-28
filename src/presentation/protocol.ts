export const PROTOCOL_VERSION = 1;
const MAX_BYTES = 8 * 1024;
const MAX_DEPTH = 8;

interface Header {
  readonly version: 1;
  readonly generation: string;
}
export interface ReadyRequest extends Header {
  readonly kind: "ready";
}
export interface AcknowledgeRequest extends Header {
  readonly kind: "acknowledge";
  readonly frame: number;
}
export interface SelectRequest extends Header {
  readonly kind: "select";
  readonly id: string | null;
}
export interface FilterRequest extends Header {
  readonly kind: "filter";
  readonly text: string;
  readonly eventPage: number;
  readonly nodePage: number;
}
export interface TopicRequest extends Header {
  readonly kind: "documentation";
  readonly topic: "architecture" | "security" | "framework-contract";
}
export interface ActionRequest extends Header {
  readonly kind: "clear" | "stop";
}
export type ViewRequest =
  | ReadyRequest
  | AcknowledgeRequest
  | SelectRequest
  | FilterRequest
  | TopicRequest
  | ActionRequest;

type RecordValue = Record<string, unknown>;
function record(value: unknown, depth = 0): value is RecordValue {
  if (
    depth > MAX_DEPTH ||
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  )
    return false;
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  return Object.values(value).every((child) =>
    typeof child !== "object" || child === null
      ? true
      : record(child, depth + 1),
  );
}
function bytes(value: unknown): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return undefined;
  }
}
function exact(value: RecordValue, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === fields.length && keys.every((key) => fields.includes(key))
  );
}
function header(value: RecordValue, generation: string): boolean {
  return (
    value.version === PROTOCOL_VERSION &&
    (value.generation === generation ||
      (value.kind === "ready" && value.generation === "")) &&
    typeof value.kind === "string"
  );
}
function page(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Decodes only the renderer actions that have a host-side meaning. */
export function request(
  raw: unknown,
  generation: string,
): ViewRequest | undefined {
  if (!record(raw) || !header(raw, generation)) return undefined;
  const size = bytes(raw);
  if (size === undefined || size > MAX_BYTES) return undefined;
  switch (raw.kind) {
    case "ready":
      return exact(raw, ["kind", "version", "generation"])
        ? { kind: "ready", version: 1, generation }
        : undefined;
    case "acknowledge":
      return exact(raw, ["kind", "version", "generation", "frame"]) &&
        page(raw.frame)
        ? { kind: "acknowledge", version: 1, generation, frame: raw.frame }
        : undefined;
    case "select":
      return exact(raw, ["kind", "version", "generation", "id"]) &&
        (typeof raw.id === "string" || raw.id === null) &&
        (raw.id === null || raw.id.length <= 256)
        ? { kind: "select", version: 1, generation, id: raw.id }
        : undefined;
    case "filter":
      return exact(raw, [
        "kind",
        "version",
        "generation",
        "text",
        "eventPage",
        "nodePage",
      ]) &&
        typeof raw.text === "string" &&
        raw.text.length <= 256 &&
        page(raw.eventPage) &&
        page(raw.nodePage)
        ? {
            kind: "filter",
            version: 1,
            generation,
            text: raw.text,
            eventPage: raw.eventPage,
            nodePage: raw.nodePage,
          }
        : undefined;
    case "clear":
    case "stop":
      return exact(raw, ["kind", "version", "generation"])
        ? { kind: raw.kind, version: 1, generation }
        : undefined;
    case "documentation":
      return exact(raw, ["kind", "version", "generation", "topic"]) &&
        (raw.topic === "architecture" ||
          raw.topic === "security" ||
          raw.topic === "framework-contract")
        ? { kind: "documentation", version: 1, generation, topic: raw.topic }
        : undefined;
    default:
      return undefined;
  }
}
