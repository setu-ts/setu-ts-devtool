import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "../discovery/discover";
import { prepareLaunch } from "../launch/preflight";
import {
  resolveDeno,
  resolveNode,
  verifyDeno,
  verifyNode,
} from "../launch/executable";
import { SessionController, type SessionState } from "../session/controller";
import { duration } from "../session/lifetime";

export function statusCommand(state: SessionState): string {
  return state === "Cleanup required"
    ? "setuDevtool.recheckCleanup"
    : "setuDevtool.stop";
}

/** Status bar text and tooltip; lifetimes are whole minutes, rounded down. */
export function statusDisplay(value: ReturnType<SessionController["status"]>): {
  text: string;
  tooltip: string;
} {
  const lifetime = value.lifetime;
  if (value.state === "Live") {
    const session =
      lifetime === null
        ? ""
        : lifetime.renewable
          ? ` Session renews automatically; up to ${duration(lifetime.maxRemainingMs ?? 0)} left in total.`
          : ` Session ends in ${duration(lifetime.remainingMs)} and cannot be renewed. Launch again to continue.`;
    return {
      text:
        lifetime !== null && !lifetime.renewable
          ? `Setu: Live · ${duration(lifetime.remainingMs)} left`
          : "Setu: Live",
      tooltip: `Application: ${value.application}; ${value.events} events.${session} Stop ends the whole launch.`,
    };
  }
  return {
    text: `Setu: ${value.state}`,
    tooltip:
      value.state === "Cleanup required"
        ? "Cleanup could not be confirmed. Stop the application manually if needed, then run Setu-TS: Recheck Cleanup. New launches are blocked."
        : value.ended === "deadline"
          ? "Session ended at its deadline. Launch again to continue."
          : "Setu-TS local diagnostics",
  };
}

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
      const display = statusDisplay(value);
      status.text = display.text;
      status.tooltip = display.tooltip;
      status.command = statusCommand(value.state);
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
        // The executable kind follows the selection; the start message follows
        // fresh discovery. They must agree (D06 review F3).
        if (descriptor.runtime !== project.runtime) throw new Error();
        const node = project.runtime === "node";
        const setting = vscode.workspace
          .getConfiguration("setuDevtool")
          .inspect<string>(node ? "nodePath" : "denoPath");
        // Only the user-level value is read; workspace overrides are ignored.
        const executable = await (node ? resolveNode : resolveDeno)(
          setting?.globalValue,
          roots(),
        );
        const runtimeLine = node
          ? `Node: ${executable.path} (npm ${await verifyNode(executable)})`
          : `Deno: ${executable.path}`;
        const answer = await vscode.window.showWarningMessage(
          `Launch ${project.label}?`,
          {
            modal: true,
            detail: `Directory: ${descriptor.root}\nStarts: ${descriptor.members.join(", ")}\nInstrumented: ${project.label}\n${runtimeLine}\nDiagnostics port: ${port}\nThe session renews automatically while the application allows it. Stop terminates all started members. Application output is not captured.`,
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
        if (node) await verifyNode(executable);
        else await verifyDeno(executable);
        const fresh = await prepareLaunch(project, port);
        // A runtime change also changes which manifests are read, so the
        // fingerprint covers it here.
        if (fresh.fingerprint !== descriptor.fingerprint) throw new Error();
        signal.throwIfAborted();
        if (guard() || selected()?.id !== generation) throw new Error();
        return { descriptor: fresh, executable };
      });
      if (session.status().state === "Failed")
        void vscode.window.showErrorMessage(
          selected()?.runtime === "node"
            ? "Setu-TS could not prepare, launch or verify the connection. Check the prepared project, that its dependencies are installed, and that Node 24.22.1 or later on the 24 line with npm 11 is on PATH or set in setuDevtool.nodePath."
            : "Setu-TS could not prepare, launch or verify the connection. Check the prepared project and qualified Deno installation.",
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
