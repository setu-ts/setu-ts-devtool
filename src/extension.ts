import * as vscode from "vscode";
import { discover, type Discovery, type Project } from "./discovery/discover";
import { refusal } from "./editor/context";
import { RefreshQueue } from "./editor/refresh";
declare const __DEV__: boolean;
interface Row {
  readonly label: string;
  readonly project?: Project;
}
export function activate(context: vscode.ExtensionContext): {
  rows(): readonly string[];
  projectIds(): readonly string[];
  selected(): string | undefined;
} {
  const changed = new vscode.EventEmitter<void>();
  let rows: Row[] = [{ label: "Refresh to discover local Setu-TS projects." }];
  let projects: readonly Project[] = [],
    selected: string | undefined;
  let watchers: vscode.Disposable[] = [],
    debounce: ReturnType<typeof setTimeout> | undefined;
  let uiGeneration = 0;
  let disposed = false,
    sample = false;
  const guard = () =>
    refusal({
      trusted: vscode.workspace.isTrusted,
      desktop: vscode.env.uiKind === vscode.UIKind.Desktop,
      remote: vscode.env.remoteName !== undefined,
      platform: process.platform,
      schemes: (vscode.workspace.workspaceFolders ?? []).map(
        (f) => f.uri.scheme,
      ),
    });
  const clearWatchers = () => {
    for (const w of watchers) w.dispose();
    watchers = [];
  };
  const clear = (label: string) => {
    projects = [];
    selected = undefined;
    rows = [{ label }];
    tree.message = "";
    changed.fire();
  };
  const tree = vscode.window.createTreeView<Row>("setuDevtool.projects", {
    treeDataProvider: {
      onDidChangeTreeData: changed.event,
      getChildren: () => rows,
      getTreeItem: (row) => {
        const item = new vscode.TreeItem(row.label);
        if (row.project) {
          item.description =
            row.project.task === "candidate"
              ? "Dev task found · launch preflight pending"
              : "Dev task missing";
          item.command = {
            command: "setuDevtool.select",
            title: "Select project",
            arguments: [row.project.id],
          };
          item.contextValue = "setuProject";
        }
        return item;
      },
    },
  });
  const queue = new RefreshQueue<Discovery>(
    async () => {
      const reason = guard();
      if (reason)
        return { projects: [], watchDirectories: [], issues: [reason] };
      return discover(
        (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      );
    },
    (result) => {
      const reason = guard();
      if (reason) {
        clearWatchers();
        clear(reason);
        return;
      }
      sample = false;
      tree.message = "";
      projects = result.projects;
      selected = undefined;
      rows = [
        ...result.projects.map((project) => ({
          label: project.label,
          project,
        })),
        ...result.issues.map((label) => ({ label })),
      ];
      if (!rows.length)
        rows = [
          { label: "No Setu-TS projects found in these workspace folders." },
        ];
      clearWatchers();
      for (const directory of result.watchDirectories) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(
            directory,
            "{setu.workspace.json,deno.json,deno.jsonc}",
          ),
        );
        const schedule = () => {
          if (disposed || sample) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            debounce = undefined;
            void queue.request();
          }, 250);
        };
        watchers.push(
          watcher,
          watcher.onDidChange(schedule),
          watcher.onDidCreate(schedule),
          watcher.onDidDelete(schedule),
        );
      }
      changed.fire();
    },
    () => {
      clearWatchers();
      clear("Project discovery failed. Refresh to try again.");
    },
  );
  const refresh = async () => {
    uiGeneration++;
    const reason = guard();
    if (reason) {
      queue.invalidate();
      clearWatchers();
      clear(reason);
      return;
    }
    sample = false;
    await queue.request();
  };
  context.subscriptions.push(
    changed,
    tree,
    vscode.commands.registerCommand("setuDevtool.refresh", refresh),
    vscode.commands.registerCommand(
      "setuDevtool.select",
      async (id: unknown) => {
        const reason = guard();
        if (reason) {
          queue.invalidate();
          clearWatchers();
          clear(reason);
          return;
        }
        let project: Project | undefined;
        if (id === undefined) {
          const choice = await vscode.window.showQuickPick(
            projects.map((p) => ({ label: p.label, id: p.id })),
            { placeHolder: "Select a project (does not launch it)" },
          );
          if (guard() || disposed) return;
          project = projects.find((p) => p.id === choice?.id);
        } else if (typeof id === "string")
          project = projects.find((p) => p.id === id);
        if (!project) return;
        selected = project.id;
        tree.message =
          "Project selected. Application launch will be available in D02.";
      },
    ),
    tree.onDidChangeVisibility((event) => {
      if (event.visible && !sample) void refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      uiGeneration++;
      if (debounce) clearTimeout(debounce);
      debounce = undefined;
      queue.invalidate();
      clearWatchers();
      clear("Workspace changed. Refresh to discover projects.");
      sample = false;
    }),
    {
      dispose: () => {
        disposed = true;
        queue.dispose();
        if (debounce) clearTimeout(debounce);
        clearWatchers();
        projects = [];
        rows = [];
        selected = undefined;
      },
    },
  );
  if (__DEV__ && context.extensionMode !== vscode.ExtensionMode.Production) {
    context.subscriptions.push(
      vscode.commands.registerCommand("setuDevtool.sample", async () => {
        const reason = guard();
        if (reason) {
          queue.invalidate();
          clearWatchers();
          clear(reason);
          return;
        }
        const generation = ++uiGeneration;
        queue.invalidate();
        clearWatchers();
        if (debounce) clearTimeout(debounce);
        const { sampleLabels } = await import("../test/fixtures/sample.js");
        if (disposed || guard() || generation !== uiGeneration) return;
        sample = true;
        projects = [];
        selected = undefined;
        rows = sampleLabels.map((label) => ({ label }));
        tree.message = "Sample data — no live connection";
        changed.fire();
      }),
    );
  }
  return {
    rows: () => rows.map((r) => r.label),
    projectIds: () => projects.map((p) => p.id),
    selected: () => selected,
  };
}
