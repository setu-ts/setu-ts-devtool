import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { Capture } from "../model/capture";
import { presentation, type PageRequest } from "../model/presentation";
import { PROTOCOL_VERSION, request } from "./protocol";

const FRAME_INTERVAL_MS = 500;
const ACK_TIMEOUT_MS = 5000;
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
  private ready = false;
  private frame = 0;
  private awaiting: number | undefined;
  private scheduled: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private lastFrameAt = 0;
  private selected: string | null = null;
  private page: PageRequest = {};
  private readonly messageTimes: number[] = [];
  private isClosed = false;

  constructor(
    context: vscode.ExtensionContext,
    private readonly session: InspectionSession,
  ) {
    const assets = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
    this.panel = vscode.window.createWebviewPanel(
      "setuDevtool.inspection",
      "Setu-TS Inspection",
      vscode.ViewColumn.Beside,
      { enableScripts: true, localResourceRoots: [assets] },
    );
    this.panel.webview.html = shell(this.panel.webview, assets);
    this.panel.onDidDispose(
      () => this.dispose(),
      undefined,
      context.subscriptions,
    );
    this.panel.onDidChangeViewState(
      () => this.refresh(),
      undefined,
      context.subscriptions,
    );
    this.panel.webview.onDidReceiveMessage(
      (raw: unknown) => this.receive(raw),
      undefined,
      context.subscriptions,
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

  refresh(): void {
    if (!this.ready || this.awaiting !== undefined || !this.panel.visible)
      return;
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
    if (!this.ready || this.awaiting !== undefined || !this.panel.visible)
      return;
    const model = presentation(this.session.displayCapture, this.page);
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
      model,
    });
    this.awaiting = frame;
    this.lastFrameAt = Date.now();
    void this.panel.webview.postMessage(value);
    this.deadline = setTimeout(() => this.panel.dispose(), ACK_TIMEOUT_MS);
  }

  private receive(raw: unknown): void {
    const now = Date.now();
    while (
      this.messageTimes[0] !== undefined &&
      now - this.messageTimes[0] > 1000
    )
      this.messageTimes.shift();
    if (this.messageTimes.length >= 20) return;
    this.messageTimes.push(now);
    const value = request(raw, this.generation);
    if (!value) return;
    if (value.kind === "ready") {
      this.ready = true;
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
    } else if (value.kind === "filter")
      this.page = {
        filter: value.text,
        eventPage: value.eventPage,
        nodePage: value.nodePage,
      };
    else if (value.kind === "clear") {
      this.selected = null;
      this.session.clear();
      this.resetFrame();
    } else if (value.kind === "stop") {
      this.selected = null;
      void this.session.stop();
      this.resetFrame();
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
    this.awaiting = undefined;
  }
}

function shell(webview: vscode.Webview, assets: vscode.Uri): string {
  const nonce = randomUUID().replaceAll("-", "");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(assets, "main.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(assets, "style.css"));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${style}"></head><body><main id="app" aria-live="polite"></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}
