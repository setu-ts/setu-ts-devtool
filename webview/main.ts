interface Frame {
  readonly kind: "frame";
  readonly version: 1;
  readonly generation: string;
  readonly frame: number;
  readonly revision: number;
  readonly selected: string | null;
  readonly model: {
    readonly state: string | null;
    readonly nodes: readonly {
      readonly id: string;
      readonly kind: string;
      readonly label: string | null;
      readonly detail: string | null;
    }[];
    readonly edges: readonly {
      readonly from: string;
      readonly to: string;
      readonly kind: string;
    }[];
    readonly events: readonly {
      readonly id: string;
      readonly sequence: number;
      readonly kind: string;
      readonly stage: string;
      readonly operationId: string;
      readonly outcome: string;
      readonly durationMs: number | null;
      readonly unresolvedParent: boolean;
      readonly unresolvedNode: boolean;
    }[];
    readonly quality: {
      readonly frameworkLost: number;
      readonly collectorDropped: number;
      readonly hostEvicted: number;
      readonly snapshotTruncated: boolean;
      readonly clippedNodes: number;
      readonly clippedEdges: number;
      readonly clippedEvents: number;
    };
  };
}
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();
const applicationRoot = document.getElementById("app");
if (!applicationRoot) throw new Error("Missing application root");
const app: HTMLElement = applicationRoot;
let generation = "";

function element(name: string, text?: string): HTMLElement {
  const value = document.createElement(name);
  if (text !== undefined) value.textContent = text;
  return value;
}
function action(
  kind: "clear" | "stop" | "documentation",
  extra: Record<string, unknown> = {},
): void {
  vscode.postMessage({ kind, version: 1, generation, ...extra });
}
function select(id: string): void {
  vscode.postMessage({ kind: "select", version: 1, generation, id });
}
function documentation(
  topic: "architecture" | "security" | "framework-contract",
): void {
  action("documentation", { topic });
}
function render(frame: Frame): void {
  generation = frame.generation;
  app.replaceChildren();
  const heading = element("h1", "Setu-TS Inspection");
  const state = element(
    "p",
    `Application state: ${frame.model.state ?? "unknown"}`,
  );
  const controls = element("div");
  controls.className = "controls";
  for (const [label, kind] of [
    ["Clear capture", "clear"],
    ["Stop application", "stop"],
  ] as const) {
    const button = element("button", label) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", () => action(kind));
    controls.append(button);
  }
  const filter = element("input") as HTMLInputElement;
  filter.type = "search";
  filter.placeholder = "Filter graph and timeline";
  filter.setAttribute("aria-label", "Filter graph and timeline");
  filter.addEventListener("change", () =>
    vscode.postMessage({
      kind: "filter",
      version: 1,
      generation,
      text: filter.value,
      eventPage: 0,
      nodePage: 0,
    }),
  );
  controls.append(filter);
  const quality = element(
    "p",
    `Capture quality: framework loss ${frame.model.quality.frameworkLost}; collector drops ${frame.model.quality.collectorDropped}; host evictions ${frame.model.quality.hostEvicted}; snapshot truncated ${frame.model.quality.snapshotTruncated ? "yes" : "no"}; page clipping ${frame.model.quality.clippedNodes + frame.model.quality.clippedEdges + frame.model.quality.clippedEvents}.`,
  );
  const graph = element("section");
  graph.append(element("h2", "Composition graph"));
  const nodes = element("ul");
  nodes.className = "graph";
  nodes.setAttribute("aria-label", "Composition graph nodes");
  for (const node of frame.model.nodes) {
    const item = element("li");
    const button = element(
      "button",
      `${node.kind} ${node.label ?? node.id}${node.detail ? ` — ${node.detail}` : ""}`,
    ) as HTMLButtonElement;
    button.type = "button";
    button.className = frame.selected === node.id ? "selected" : "";
    button.addEventListener("click", () => select(node.id));
    item.append(button);
    nodes.append(item);
  }
  const relationships = element(
    "p",
    `Relationships: ${frame.model.edges.map((edge) => `${edge.from} → ${edge.to} (${edge.kind})`).join("; ") || "none"}`,
  );
  graph.append(nodes, relationships);
  const timeline = element("section");
  timeline.append(element("h2", "Request timeline"));
  const events = element("ol");
  for (const event of frame.model.events) {
    const partial =
      event.unresolvedParent || event.unresolvedNode
        ? "; partial relationship"
        : "";
    const item = element(
      "li",
      `${event.kind}/${event.stage} ${event.operationId}: ${event.outcome}; duration ${event.durationMs ?? "unknown"}${partial}`,
    );
    item.tabIndex = 0;
    item.className = frame.selected === event.id ? "selected" : "";
    item.addEventListener("click", () => select(event.id));
    events.append(item);
  }
  timeline.append(events);
  const help = element("section");
  help.append(element("h2", "Documentation"));
  for (const [label, topic] of [
    ["Architecture", "architecture"],
    ["Security", "security"],
    ["Framework diagnostics contract", "framework-contract"],
  ] as const) {
    const button = element("button", label) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", () => documentation(topic));
    help.append(button);
  }
  app.append(heading, state, controls, quality, graph, timeline, help);
  vscode.postMessage({
    kind: "acknowledge",
    version: 1,
    generation,
    frame: frame.frame,
  });
}
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "frame"
  )
    render(value as Frame);
});
vscode.postMessage({ kind: "ready", version: 1, generation });

export {};
