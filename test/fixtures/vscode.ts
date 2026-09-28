/** Minimal editor double; production/host builds always externalize real vscode. */
export class EventEmitter<T> {
  private listeners: ((value: T) => void)[] = [];
  event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };
  fire(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
  dispose(): void {
    this.listeners = [];
  }
  get listenerCount(): number {
    return this.listeners.length;
  }
}
export class TreeItem {
  constructor(public label: string) {}
}
export class RelativePattern {
  constructor(
    public base: string,
    public pattern: string,
  ) {}
}
export const UIKind = { Desktop: 1, Web: 2 },
  ExtensionMode = { Production: 1, Development: 2, Test: 3 },
  StatusBarAlignment = { Left: 1 },
  ViewColumn = { Beside: 2 };
export const Uri = {
  joinPath: (...parts: unknown[]) => parts.join("/"),
  parse: (value: string) => value,
};
export const workspaceChanged = new EventEmitter<void>(),
  visibility = new EventEmitter<{ visible: boolean }>();
export const fileChanged = new EventEmitter<void>();
interface TestPanel {
  readonly webview: {
    html: string;
    readonly cspSource: string;
    asWebviewUri(uri: unknown): string;
    postMessage(value: unknown): Promise<boolean>;
    onDidReceiveMessage(listener: (value: unknown) => void): {
      dispose(): void;
    };
  };
  visible: boolean;
  reveal(): void;
  dispose(): void;
  onDidDispose(listener: () => void): { dispose(): void };
  onDidChangeViewState(listener: () => void): { dispose(): void };
  receive(value: unknown): void;
  listenerCounts(): readonly number[];
  readonly messages: unknown[];
}
export const panels: TestPanel[] = [];
export const opened: unknown[] = [];
export const state: {
  input: string | undefined;
  confirmation: string | undefined;
  pick: boolean;
  onConfirm: () => Promise<void>;
  errors: string[];
  details: string[];
  setting: string | undefined;
  inputCheck: ((text: string) => unknown) | undefined;
  watchError: boolean;
} = {
  input: undefined,
  confirmation: undefined,
  pick: true,
  onConfirm: async () => {},
  errors: [],
  details: [],
  setting: undefined,
  inputCheck: undefined,
  watchError: false,
};
export const workspace = {
  isTrusted: true,
  workspaceFolders: [] as { uri: { scheme: string; fsPath: string } }[],
  onDidChangeWorkspaceFolders: workspaceChanged.event,
  getConfiguration: () => ({
    inspect: () => ({
      globalValue: state.setting,
      workspaceValue: "/untrusted/workspace-override",
    }),
  }),
  createFileSystemWatcher: () => {
    if (state.watchError) throw new Error("Watcher unavailable");
    return {
      dispose() {},
      onDidChange: fileChanged.event,
      onDidCreate: fileChanged.event,
      onDidDelete: fileChanged.event,
    };
  },
};
export const env: {
  uiKind: number;
  remoteName: string | undefined;
  openExternal(uri: unknown): Promise<boolean>;
} = {
  uiKind: 1,
  remoteName: undefined,
  openExternal: async (uri) => {
    opened.push(uri);
    return true;
  },
};
const handlers = new Map<string, (...args: unknown[]) => unknown>();
export const commands = {
  registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
    handlers.set(id, callback);
    return {
      dispose: () => {
        handlers.delete(id);
      },
    };
  },
  executeCommand: async (id: string, ...args: unknown[]) =>
    handlers.get(id)?.(...args),
  getCommands: async () => [...handlers.keys()],
};
export const window = {
  createTreeView: (_id: string, options: unknown) => {
    const provider = (
      options as {
        treeDataProvider: {
          getChildren(): unknown[];
          getTreeItem(row: unknown): unknown;
          onDidChangeTreeData: (fn: () => void) => { dispose(): void };
        };
      }
    ).treeDataProvider;
    const render = () => {
      for (const row of provider.getChildren()) provider.getTreeItem(row);
    };
    const listener = provider.onDidChangeTreeData(render);
    render();
    return {
      message: "",
      dispose() {
        listener.dispose();
      },
      onDidChangeVisibility: visibility.event,
    };
  },
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: "",
    show() {},
    dispose() {},
  }),
  createWebviewPanel: () => {
    const disposed = new EventEmitter<void>(),
      viewState = new EventEmitter<void>(),
      received = new EventEmitter<unknown>(),
      messages: unknown[] = [];
    const panel: TestPanel = {
      webview: {
        html: "",
        cspSource: "vscode-webview-resource:",
        asWebviewUri: (uri) => String(uri),
        postMessage: async (value) => {
          messages.push(value);
          return true;
        },
        onDidReceiveMessage: received.event,
      },
      visible: true,
      reveal: () => {
        panel.visible = true;
        viewState.fire();
      },
      dispose: () => disposed.fire(),
      onDidDispose: disposed.event,
      onDidChangeViewState: viewState.event,
      receive: (value) => received.fire(value),
      listenerCounts: () => [
        disposed.listenerCount,
        viewState.listenerCount,
        received.listenerCount,
      ],
      messages,
    };
    panels.push(panel);
    return panel;
  },
  showQuickPick: async (choices: unknown[]) =>
    state.pick ? choices[0] : undefined,
  showInputBox: async (options: {
    validateInput: (text: string) => unknown;
  }) => {
    state.inputCheck = options.validateInput;
    return state.input;
  },
  showWarningMessage: async (_message: string, options: { detail: string }) => {
    state.details.push(options.detail);
    await state.onConfirm();
    return state.confirmation;
  },
  showErrorMessage: async (message: string) => {
    state.errors.push(message);
  },
};
