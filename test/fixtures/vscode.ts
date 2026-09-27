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
  StatusBarAlignment = { Left: 1 };
export const workspaceChanged = new EventEmitter<void>(),
  visibility = new EventEmitter<{ visible: boolean }>();
export const fileChanged = new EventEmitter<void>();
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
export const env: { uiKind: number; remoteName: string | undefined } = {
  uiKind: 1,
  remoteName: undefined,
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
