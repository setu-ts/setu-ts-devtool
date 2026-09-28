import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { Capture } from "../model/capture";
import {
  presentation,
  type DisplayModel,
  type PageRequest,
} from "../model/presentation";
import { PROTOCOL_VERSION, request } from "./protocol";

const FRAME_INTERVAL_MS = 500;
const ACK_TIMEOUT_MS = 5000;
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_MODEL_BYTES = MAX_FRAME_BYTES - 1024;
const TOPICS = Object.freeze({
  architecture:
    "https://github.com/setu-ts/setu-ts-devtool/blob/main/docs/architecture.md",
  security:
    "https://github.com/setu-ts/setu-ts-devtool/blob/main/docs/security.md",
  "framework-contract":
    "https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/docs/diagnostics-protocol.md",
});

export interface InspectionSession {
  readonly displayCapture: Capture;
  clear(): void;
  stop(): Promise<void>;
}

export class InspectionPanel implements vscode.Disposable {
  private readonly generation = randomUUID();
  private readonly panel: vscode.WebviewPanel;
  private readonly readyWaiters: ((ready: boolean) => void)[] = [];
  private ready = false;
  private dirty = true;
  private frame = 0;
  private awaiting: number | undefined;
  private scheduled: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private lastFrameAt = 0;
  private lastRevision = -1;
  private selected: string | null = null;
  private page: PageRequest = {};
  private messageTokens = 20;
  private lastMessageRefillAt = Date.now();
  private readonly subscriptions: vscode.Disposable[] = [];
  private isClosed = false;

  constructor(
    context: vscode.ExtensionContext,
    private readonly session: InspectionSession,
    private readonly sample = false,
  ) {
    const assets = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
    this.panel = vscode.window.createWebviewPanel(
      "setuDevtool.inspection",
      "Setu-TS Inspection",
      vscode.ViewColumn.Beside,
      { enableScripts: true, localResourceRoots: [assets] },
    );
    this.panel.webview.html = shell(this.panel.webview, assets);
    this.subscriptions.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.onDidChangeViewState(() => this.refresh()),
      this.panel.webview.onDidReceiveMessage((raw: unknown) =>
        this.receive(raw),
      ),
    );
  }

  reveal(): void {
    if (this.isClosed) return;
    this.panel.reveal(vscode.ViewColumn.Beside, false);
    this.refresh();
  }

  get closed(): boolean {
    return this.isClosed;
  }

  update(): void {
    this.dirty = true;
    this.refresh();
  }

  waitForRenderer(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.isClosed) return Promise.resolve(false);
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  refresh(): void {
    if (!this.ready || !this.panel.visible) return;
    if (this.lastRevision !== this.session.displayCapture.revision) {
      this.dirty = true;
      if (this.awaiting !== undefined) this.resetFrame();
    }
    if (this.awaiting !== undefined || !this.dirty) return;
    const delay = Math.max(
      0,
      FRAME_INTERVAL_MS - (Date.now() - this.lastFrameAt),
    );
    if (this.scheduled) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.send();
    }, delay);
  }

  private send(): void {
    if (
      !this.ready ||
      !this.dirty ||
      this.awaiting !== undefined ||
      !this.panel.visible
    )
      return;
    const model = boundedModel(
      presentation(this.session.displayCapture, this.page),
    );
    const ids = new Set([
      ...model.nodes.map((node) => node.id),
      ...model.events.map((event) => event.id),
    ]);
    if (this.selected !== null && !ids.has(this.selected)) this.selected = null;
    const frame = ++this.frame;
    const value = Object.freeze({
      kind: "frame",
      version: PROTOCOL_VERSION,
      generation: this.generation,
      frame,
      revision: this.session.displayCapture.revision,
      selected: this.selected,
      sample: this.sample,
      model,
    });
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_FRAME_BYTES) {
      this.panel.dispose();
      return;
    }
    this.dirty = false;
    this.awaiting = frame;
    this.lastRevision = value.revision;
    this.lastFrameAt = Date.now();
    void this.panel.webview.postMessage(value).then(undefined, () => {
      if (this.awaiting === frame) this.panel.dispose();
    });
    this.deadline = setTimeout(() => this.panel.dispose(), ACK_TIMEOUT_MS);
  }

  private receive(raw: unknown): void {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastMessageRefillAt);
    this.messageTokens = Math.min(20, this.messageTokens + elapsed * 0.02);
    this.lastMessageRefillAt = now;
    if (this.messageTokens < 1) return;
    this.messageTokens -= 1;
    const value = request(raw, this.generation);
    if (!value) return;
    if (value.kind === "ready") {
      this.ready = true;
      for (const waiter of this.readyWaiters.splice(0)) waiter(true);
      this.refresh();
      return;
    }
    if (value.kind === "acknowledge") {
      if (value.frame !== this.awaiting) return;
      this.awaiting = undefined;
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = undefined;
      this.refresh();
      return;
    }
    if (value.kind === "select") {
      const model = presentation(this.session.displayCapture, this.page);
      const ids = new Set([
        ...model.nodes.map((node) => node.id),
        ...model.events.map((event) => event.id),
      ]);
      if (value.id === null || ids.has(value.id)) this.selected = value.id;
      this.dirty = true;
    } else if (value.kind === "filter") {
      this.page = {
        filter: value.text,
        eventPage: value.eventPage,
        nodePage: value.nodePage,
      };
      this.dirty = true;
    } else if (value.kind === "clear") {
      this.selected = null;
      this.session.clear();
      this.resetFrame();
      this.dirty = true;
    } else if (value.kind === "stop") {
      this.selected = null;
      this.page = {};
      void this.session.stop();
      this.resetFrame();
      this.dirty = true;
    } else if (value.kind === "documentation")
      void vscode.env.openExternal(vscode.Uri.parse(TOPICS[value.topic]));
    this.refresh();
  }

  private resetFrame(): void {
    this.awaiting = undefined;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = undefined;
  }

  dispose(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.scheduled) clearTimeout(this.scheduled);
    if (this.deadline) clearTimeout(this.deadline);
    this.scheduled = undefined;
    this.deadline = undefined;
    this.ready = false;
    this.dirty = false;
    this.awaiting = undefined;
    this.selected = null;
    this.page = {};
    this.messageTokens = 20;
    this.lastMessageRefillAt = Date.now();
    for (const waiter of this.readyWaiters.splice(0)) waiter(false);
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions.length = 0;
    this.panel.dispose();
  }
}

function shell(webview: vscode.Webview, assets: vscode.Uri): string {
  const nonce = randomUUID().replaceAll("-", "");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(assets, "main.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(assets, "style.css"));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${style}"></head><body><main id="app" aria-live="polite"></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

function boundedModel(model: DisplayModel): DisplayModel {
  const nodes = [...model.nodes];
  let edges = [...model.edges];
  const events = [...model.events];
  let clippedNodes = model.quality.clippedNodes;
  let clippedEdges = model.quality.clippedEdges;
  let clippedEvents = model.quality.clippedEvents;
  const build = (): DisplayModel =>
    Object.freeze({
      ...model,
      nodes: Object.freeze([...nodes]),
      edges: Object.freeze([...edges]),
      events: Object.freeze([...events]),
      quality: Object.freeze({
        ...model.quality,
        clippedNodes,
        clippedEdges,
        clippedEvents,
      }),
    });
  while (Buffer.byteLength(JSON.stringify(build())) > MAX_MODEL_BYTES) {
    if (events.length > 0) {
      events.pop();
      clippedEvents++;
      continue;
    }
    if (edges.length > 0) {
      edges.pop();
      clippedEdges++;
      continue;
    }
    const removed = nodes.pop();
    if (!removed) return build();
    clippedNodes++;
    const before = edges.length;
    edges = edges.filter(
      (edge) => edge.from !== removed.id && edge.to !== removed.id,
    );
    clippedEdges += before - edges.length;
  }
  return build();
}
