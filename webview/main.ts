interface Frame {
  readonly kind: "frame";
  readonly version: 1;
  readonly generation: string;
  readonly frame: number;
  readonly revision: number;
  readonly selected: string | null;
  readonly sample: boolean;
  readonly model: {
    readonly state: string | null;
    readonly failureCode: string | null;
    readonly nodes: readonly {
      readonly id: string;
      readonly kind: string;
      readonly label: string | null;
      readonly detail: string | null;
      readonly registered: boolean | null;
    }[];
    readonly edges: readonly {
      readonly from: string;
      readonly to: string;
      readonly kind: string;
    }[];
    readonly events: readonly {
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
    readonly page: {
      readonly filter: string;
      readonly node: number;
      readonly nodes: number;
      readonly event: number;
      readonly events: number;
    };
  };
}
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();
const applicationRoot = document.getElementById("app");
if (!applicationRoot) throw new Error("Missing application root");
const app: HTMLElement = applicationRoot;
let generation = "";
let filterText = "";
let pendingFilter = false;

function element(name: string, text?: string): HTMLElement {
  const value = document.createElement(name);
  if (text !== undefined) value.textContent = text;
  return value;
}
function svgElement(name: string): SVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
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
function filter(nodePage: number, eventPage: number): void {
  pendingFilter = true;
  vscode.postMessage({
    kind: "filter",
    version: 1,
    generation,
    text: filterText,
    eventPage,
    nodePage,
  });
}
function graph(
  nodes: Frame["model"]["nodes"],
  edges: Frame["model"]["edges"],
): SVGElement {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const width = 640;
  const height = Math.max(100, Math.ceil(nodes.length / columns) * 86 + 24);
  const view = svgElement("svg");
  view.setAttribute("class", "topology");
  view.setAttribute("viewBox", `0 0 ${width} ${height}`);
  view.setAttribute("role", "img");
  view.setAttribute(
    "aria-label",
    "Visual composition topology; the accessible node list follows.",
  );
  const positions = new Map<string, readonly [number, number]>();
  for (const [index, node] of nodes.entries())
    positions.set(node.id, [
      32 + (index % columns) * (width / columns),
      32 + Math.floor(index / columns) * 86,
    ]);
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const line = svgElement("line");
    line.setAttribute("x1", String(from[0] + 80));
    line.setAttribute("y1", String(from[1] + 24));
    line.setAttribute("x2", String(to[0]));
    line.setAttribute("y2", String(to[1] + 24));
    line.setAttribute("class", "edge");
    view.append(line);
  }
  for (const node of nodes) {
    const position = positions.get(node.id)!;
    const group = svgElement("g");
    const box = svgElement("rect");
    box.setAttribute("x", String(position[0]));
    box.setAttribute("y", String(position[1]));
    box.setAttribute("width", "160");
    box.setAttribute("height", "48");
    box.setAttribute("rx", "4");
    box.setAttribute("class", "node");
    const label = svgElement("text");
    label.setAttribute("x", String(position[0] + 8));
    label.setAttribute("y", String(position[1] + 20));
    label.setAttribute("class", "node-label");
    label.textContent = `${node.kind}: ${node.label ?? node.id}`;
    group.append(box, label);
    view.append(group);
  }
  return view;
}
function pager(
  label: string,
  current: number,
  total: number,
  navigate: (page: number) => void,
): HTMLElement {
  const controls = element("div");
  controls.className = "pager";
  const previous = element("button", "Previous") as HTMLButtonElement;
  previous.type = "button";
  previous.disabled = current === 0;
  previous.addEventListener("click", () => navigate(current - 1));
  const next = element("button", "Next") as HTMLButtonElement;
  next.type = "button";
  next.disabled = current + 1 >= total;
  next.addEventListener("click", () => navigate(current + 1));
  controls.append(
    previous,
    element("span", `${label} ${current + 1} of ${total}`),
    next,
  );
  return controls;
}
function details(frame: Frame): HTMLElement {
  const section = element("section");
  section.append(element("h2", "Selected record"));
  const node = frame.model.nodes.find((value) => value.id === frame.selected);
  if (node) {
    section.append(
      element(
        "p",
        `${node.kind} ${node.label ?? node.id}; detail ${node.detail ?? "unknown"}; registered ${node.registered === null ? "unknown" : String(node.registered)}`,
      ),
    );
    return section;
  }
  const event = frame.model.events.find((value) => value.id === frame.selected);
  section.append(
    element(
      "p",
      event
        ? `${event.kind}/${event.stage}; operation ${event.operationId}; parent ${event.parentOperationId ?? "none"}; node ${event.nodeId ?? "none"}; outcome ${event.outcome}; started ${event.atMs ?? "unknown"}; duration ${event.durationMs ?? "unknown"}; status ${event.statusCode ?? "unknown"}`
        : "Select a graph node or timeline record for its bounded details.",
    ),
  );
  return section;
}
function render(frame: Frame): void {
  generation = frame.generation;
  if (!pendingFilter || frame.model.page.filter === filterText) {
    filterText = frame.model.page.filter;
    pendingFilter = false;
  }
  app.replaceChildren();
  app.append(element("h1", "Setu-TS Inspection"));
  if (frame.sample) {
    const sample = element("p", "Sample data — no live connection");
    sample.className = "sample";
    app.append(sample);
  }
  app.append(
    element(
      "p",
      `Application state: ${frame.model.state ?? "unknown"}${frame.model.failureCode ? `; failure ${frame.model.failureCode}` : ""}`,
    ),
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
  const input = element("input") as HTMLInputElement;
  input.type = "search";
  input.value = filterText;
  input.placeholder = "Filter graph and timeline";
  input.setAttribute("aria-label", "Filter graph and timeline");
  input.addEventListener("input", () => {
    filterText = input.value;
    filter(0, 0);
  });
  controls.append(input);
  app.append(controls);
  app.append(
    element(
      "p",
      `Capture quality: framework loss ${frame.model.quality.frameworkLost}; collector drops ${frame.model.quality.collectorDropped}; host evictions ${frame.model.quality.hostEvicted}; snapshot truncated ${frame.model.quality.snapshotTruncated ? "yes" : "no"}; clipped nodes ${frame.model.quality.clippedNodes}; clipped relationships ${frame.model.quality.clippedEdges}; clipped timeline records ${frame.model.quality.clippedEvents}.`,
    ),
  );
  const composition = element("section");
  composition.append(
    element("h2", "Composition graph"),
    graph(frame.model.nodes, frame.model.edges),
  );
  const nodes = element("ul");
  nodes.className = "graph-list";
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
  composition.append(
    nodes,
    element(
      "p",
      `Relationships: ${frame.model.edges.map((edge) => `${edge.from} → ${edge.to} (${edge.kind})`).join("; ") || "none"}`,
    ),
    pager("Graph page", frame.model.page.node, frame.model.page.nodes, (page) =>
      filter(page, frame.model.page.event),
    ),
  );
  const timeline = element("section");
  timeline.append(element("h2", "Request timeline"));
  const events = element("ol");
  for (const event of frame.model.events) {
    const partial =
      event.unresolvedParent || event.unresolvedNode
        ? "; partial relationship"
        : "";
    const item = element("li");
    const button = element(
      "button",
      `${event.kind}/${event.stage} ${event.operationId}: ${event.outcome}; duration ${event.durationMs ?? "unknown"}${partial}`,
    ) as HTMLButtonElement;
    button.type = "button";
    button.className = frame.selected === event.id ? "selected" : "";
    button.addEventListener("click", () => select(event.id));
    item.append(button);
    events.append(item);
  }
  timeline.append(
    events,
    pager(
      "Timeline page",
      frame.model.page.event,
      frame.model.page.events,
      (page) => filter(frame.model.page.node, page),
    ),
  );
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
  app.append(composition, timeline, details(frame), help);
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
