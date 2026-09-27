import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "../discovery/discover";
import { prepareLaunch } from "../launch/preflight";
import { resolveDeno, verifyDeno } from "../launch/executable";
import { SessionController } from "../session/controller";
export function connectCommands(
  context: vscode.ExtensionContext,
  guard: () => string | undefined,
  selected: () => Project | undefined,
  roots: () => readonly string[],
  changed: () => void,
): SessionController {
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    20,
  );
  const session = new SessionController(
    join(context.extensionPath, "dist/supervisor.mjs"),
    () => {
      const value = session.status();
      status.text = `Setu: ${value.state}`;
      status.tooltip =
        value.state === "Live"
          ? `Application: ${value.application}; ${value.events} events. Local session limit: 15 minutes. Stop ends the whole launch.`
          : value.state === "Cleanup required"
            ? "Cleanup could not be confirmed. Stop the application manually if needed, then run Setu-TS: Recheck Cleanup. New launches are blocked."
            : "Setu-TS local diagnostics";
      status.command = "setuDevtool.stop";
      status.show();
      changed();
    },
    undefined,
    () => !guard(),
  );
  context.subscriptions.push(
    status,
    vscode.commands.registerCommand("setuDevtool.launch", async () => {
      if (guard() || session.busy) return;
      await session.start(async (signal) => {
        const project = selected();
        if (!project) throw new Error();
        const generation = project.id;
        let port = project.diagnosticsPort;
        if (project.member === null) {
          const answer = await vscode.window.showInputBox({
            title: "Diagnostics port (4919 is the scaffold default)",
            value: "4919",
            validateInput: (text) =>
              /^\d+$/.test(text) &&
              Number(text) >= 1024 &&
              Number(text) <= 65535
                ? undefined
                : "Enter an integer from 1024 to 65535.",
          });
          if (answer === undefined) return;
          port = Number(answer);
        }
        if (port === null) throw new Error();
        signal.throwIfAborted();
        if (guard() || selected()?.id !== generation) throw new Error();
        const descriptor = await prepareLaunch(project, port);
        const setting = vscode.workspace
          .getConfiguration("setuDevtool")
          .inspect<string>("denoPath");
        const executable = await resolveDeno(setting?.globalValue, roots());
        const answer = await vscode.window.showWarningMessage(
          `Launch ${project.label}?`,
          {
            modal: true,
            detail: `Directory: ${descriptor.root}\nStarts: ${descriptor.members.join(", ")}\nInstrumented: ${project.label}\nDeno: ${executable.path}\nDiagnostics port: ${port}\nLocal limit: 15 minutes. Stop terminates all started members. Application output is not captured.`,
          },
          "Launch",
        );
        if (answer !== "Launch") return;
        signal.throwIfAborted();
        if (
          guard() ||
          selected()?.id !== generation ||
          !(await Promise.all(roots().map((root) => realpath(root)))).includes(
            project.root,
          )
        )
          throw new Error();
        await verifyDeno(executable);
        const fresh = await prepareLaunch(project, port);
        if (fresh.fingerprint !== descriptor.fingerprint) throw new Error();
        signal.throwIfAborted();
        if (guard() || selected()?.id !== generation) throw new Error();
        return { descriptor: fresh, executable };
      });
      if (session.status().state === "Failed")
        void vscode.window.showErrorMessage(
          "Setu-TS could not prepare, launch or verify the connection. Check the prepared project and qualified Deno installation.",
        );
    }),
    vscode.commands.registerCommand("setuDevtool.stop", () => session.stop()),
    vscode.commands.registerCommand("setuDevtool.clear", () => session.clear()),
    vscode.commands.registerCommand("setuDevtool.recheckCleanup", () =>
      session.recheck(),
    ),
  );
  return session;
}
