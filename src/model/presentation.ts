import type { DiagnosticsEvent, DiagnosticsSnapshot } from "@setu-ts/common";
import type { Capture } from "./capture";

const MAX_NODES = 100;
const MAX_EDGES = 200;
const MAX_EVENTS = 100;
const MAX_FILTER = 256;
const MAX_LABEL = 160;

export interface DisplayNode {
  readonly id: string;
  readonly kind: string;
  readonly label: string | null;
  readonly detail: string | null;
  readonly registered: boolean | null;
}

export interface DisplayEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

export interface DisplayEvent {
  readonly id: string;
  readonly sequence: number;
  readonly operationId: string;
  readonly parentOperationId: string | null;
  readonly kind: string;
  readonly stage: string;
  readonly nodeId: string | null;
  readonly outcome: string;
  readonly atMs: number | null;
  readonly durationMs: number | null;
  readonly statusCode: number | null;
  readonly unresolvedParent: boolean;
  readonly unresolvedNode: boolean;
}

export interface CaptureQuality {
  readonly frameworkLost: number;
  readonly collectorDropped: number;
  readonly hostEvicted: number;
  readonly snapshotTruncated: boolean;
  readonly clippedNodes: number;
  readonly clippedEdges: number;
  readonly clippedEvents: number;
}

export interface DisplayModel {
  readonly state: string | null;
  readonly failureCode: string | null;
  readonly nodes: readonly DisplayNode[];
  readonly edges: readonly DisplayEdge[];
  readonly events: readonly DisplayEvent[];
  readonly quality: CaptureQuality;
  readonly page: Readonly<{
    filter: string;
    node: number;
    nodes: number;
    event: number;
    events: number;
  }>;
}

export interface PageRequest {
  readonly filter?: string;
  readonly eventPage?: number;
  readonly nodePage?: number;
}

function clip(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value.length <= MAX_LABEL
    ? value
    : value.slice(0, MAX_LABEL - 1) + "…";
}

function detail(node: DiagnosticsSnapshot["nodes"][number]): string | null {
  if (node.version !== undefined) return clip(node.version);
  if (node.method !== undefined) return clip(node.method);
  if (node.priority !== undefined || node.position !== undefined)
    return `${node.priority ?? ""}${node.priority !== undefined && node.position !== undefined ? " · " : ""}${node.position ?? ""}`;
  return null;
}

function matches(value: string, filter: string): boolean {
  return value.toLocaleLowerCase().includes(filter.toLocaleLowerCase());
}

function filterText(value: string | undefined): string {
  return (value ?? "").slice(0, MAX_FILTER);
}

function page<T>(
  values: readonly T[],
  index: number,
  limit: number,
): readonly T[] {
  const start = index * limit;
  return values.slice(start, start + limit);
}
function pageIndex(
  value: number | undefined,
  total: number,
  limit: number,
): number {
  return Math.min(
    Math.max(0, value ?? 0),
    Math.max(0, Math.ceil(total / limit) - 1),
  );
}

function displayEvent(
  event: DiagnosticsEvent,
  operations: ReadonlySet<string>,
  nodes: ReadonlySet<string>,
): DisplayEvent {
  return Object.freeze({
    id: `e${event.sequence}`,
    sequence: event.sequence,
    operationId: event.operationId,
    parentOperationId: event.parentOperationId,
    kind: event.kind,
    stage: event.stage,
    nodeId: event.nodeId,
    outcome: event.outcome,
    atMs: event.atMs,
    durationMs: event.durationMs,
    statusCode: event.statusCode ?? null,
    unresolvedParent:
      event.parentOperationId !== null &&
      !operations.has(event.parentOperationId),
    unresolvedNode: event.nodeId !== null && !nodes.has(event.nodeId),
  });
}

/** Creates a bounded, renderer-safe view without exposing capture DTOs. */
export function presentation(
  capture: Capture,
  request: PageRequest = {},
): DisplayModel {
  const snapshot = capture.snapshot;
  const filter = filterText(request.filter);
  const allNodes = snapshot?.nodes ?? [];
  const nodeIds = new Set(allNodes.map((node) => node.id));
  const allEvents = capture.events;
  const operations = new Set(allEvents.map((event) => event.operationId));
  const nodes = allNodes
    .map((node) =>
      Object.freeze({
        id: node.id,
        kind: node.kind,
        label: clip(node.label),
        detail: detail(node),
        registered: node.registered ?? null,
      }),
    )
    .filter(
      (node) =>
        !filter ||
        matches(
          `${node.id} ${node.kind} ${node.label ?? ""} ${node.detail ?? ""}`,
          filter,
        ),
    );
  const events = allEvents
    .map((event) => displayEvent(event, operations, nodeIds))
    .filter(
      (event) =>
        !filter ||
        matches(
          `${event.operationId} ${event.kind} ${event.stage} ${event.nodeId ?? ""} ${event.outcome}`,
          filter,
        ),
    );
  const nodePage = pageIndex(request.nodePage, nodes.length, MAX_NODES);
  const eventPage = pageIndex(request.eventPage, events.length, MAX_EVENTS);
  const visibleNodes = page(nodes, nodePage, MAX_NODES);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const edges = (snapshot?.edges ?? [])
    .filter(
      (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
    )
    .slice(0, MAX_EDGES)
    .map((edge) =>
      Object.freeze({ from: edge.from, to: edge.to, kind: edge.kind }),
    );
  const visibleEvents = page(events, eventPage, MAX_EVENTS);
  return Object.freeze({
    state: snapshot?.state ?? null,
    failureCode: snapshot?.failureCode ?? null,
    nodes: Object.freeze(visibleNodes),
    edges: Object.freeze(edges),
    events: Object.freeze(visibleEvents),
    page: Object.freeze({
      filter,
      node: nodePage,
      nodes: Math.max(1, Math.ceil(nodes.length / MAX_NODES)),
      event: eventPage,
      events: Math.max(1, Math.ceil(events.length / MAX_EVENTS)),
    }),
    quality: Object.freeze({
      frameworkLost: capture.lost,
      collectorDropped: snapshot?.droppedEvents ?? 0,
      hostEvicted: capture.evicted,
      snapshotTruncated: snapshot?.truncated ?? false,
      clippedNodes: Math.max(0, nodes.length - visibleNodes.length),
      clippedEdges: Math.max(0, (snapshot?.edges.length ?? 0) - edges.length),
      clippedEvents: Math.max(0, events.length - visibleEvents.length),
    }),
  });
}
