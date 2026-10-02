# Setu-TS Devtool

Local development companion for Setu-TS applications and monorepos.

**Status: pre-release.** D01–D03 are implemented and locally verified for the
Linux scope; no release has been published. The
[roadmap milestone table](ROADMAP.md#milestones) is the status record and links
each milestone's evidence.

The extension discovers prepared projects, explicitly launches a local Deno
application, pairs, captures bounded diagnostics and stops its owned processes.
The inspection panel presents a bounded composition graph and request timeline.

The first release is a free desktop extension for VS Code and Code OSS. Its main
workflow is: select a local project, explicitly launch an instrumented Deno
application, inspect plugins and routes, and follow request execution through
middleware and handlers. Diagnostic data stays local and in memory. No account
is required.

## Planning documents

- [Product roadmap and Free/Pro boundary](ROADMAP.md)
- [Framework contracts and compatibility gates](docs/framework-compatibility.md)
- [Extension architecture](docs/architecture.md)
- [Security model and acceptance matrix](docs/security.md)
- [Framework addons assessment](docs/framework-addons.md) (historical; predates
  M98d–n — see the [roadmap's framework baseline](ROADMAP.md#framework-baseline))

The architecture and security documents describe the full preview target. See the
[implementation sequence](plans/README.md) and the
[D01](plans/d01-foundation.md), [D02](plans/d02-connection.md) and
[D03](plans/d03-inspection.md) plans for the implemented subset; later security
acceptance cases remain pending.

## Working alongside the framework

Keep the framework and devtool in separate Git repositories. Open a worktree
from each in a multi-root editor workspace. Changes to framework APIs belong in
the framework repository and its own milestone branch. Each devtool
implementation milestone gets its own branch and keeps its follow-up fixes there
until merge.

The contract register is pinned to merged framework commit
`26aebd0e3fd16074d7b578623577fe87a1930e83`. It covers core M98a–c contracts
and current M98d–g client additions,
generated development entries, credential handoff and the repaired core client.
Local builds use that exact revision before publication; released-package and
VSIX compatibility still need separate evidence. Framework `main` has since
merged the M98h–n observation families, which are not qualified against this
pin, and no published framework release contains `@setu-ts/diagnostics-plugin`
yet. See the [roadmap's framework baseline](ROADMAP.md#framework-baseline).

## Develop and verify

Use Node 24, npm and Deno 2.9.6. Prepare a clean framework checkout at the
pin in `scripts/framework-pin.json`; preparation refuses a different or dirty tree. Open this repository in local desktop Code OSS on Linux.
The measured engine floor is 1.138.0; other editor versions are not qualified yet.

```sh
npm ci
npm run prepare:framework -- ../path-to-clean-pinned-framework
npm run check
npm run format:check
npm test
npm run test:integration
npm run test:coverage
npm run build:dev
npm run test:host
npm run build
npm run test:host -- --production
npm run test:host -- --restricted
```

Host tests require a graphical session and `code-oss` on PATH (or set
`SETU_TEST_EDITOR` to an editor executable). Each uses isolated profiles and a
synthetic workspace under `.tmp/`. CI prepares the same pin and runs the non-GUI checks, real Deno integration
tests and per-file 90% branch/function/line coverage gate.

Press F5 to start the development extension host. Open **Setu-TS Projects** in
Explorer or run **Setu-TS: Refresh Projects**, then select a discovered project.
Selection does not execute application code. Discovery accepts standalone Deno
configs importing Setu packages and v1 `setu.workspace.json` manifests with
members under `apps/<name>`. A discovered `dev` task is only a launch candidate.

For a synthetic preview, the development host's Debug Console can invoke
`vscode.commands.executeCommand("setuDevtool.sample")` while paused in extension
code with `vscode` in scope. The command is intentionally absent from the
production bundle and command palette. Refresh returns to real project discovery.

Run **Setu-TS: Launch** after selecting a prepared project. For a standalone
project, enter the diagnostics port embedded in its generated `main.dev.ts`.
Review the native confirmation: a workspace launch starts every member and
instruments only the selected one. **Setu-TS: Stop Application** stops that whole
launch. **Setu-TS: Clear Capture** drops retained events without rewinding the
cursor. Native status separates connection and application state; the inspection
panel persists no state and is rebuilt from the bounded host capture.

Only qualified CLI-generated Deno recipes are accepted. The extension does not
enable or migrate projects automatically, capture application output, or attach
to an existing process. Optional `setuDevtool.denoPath` is an absolute user-level
setting; workspace overrides are ignored. A fresh local session lasts at most
15 minutes and is never automatically renewed or restarted. Renewal without
relaunch is planned as [D03b](ROADMAP.md#d03b--session-renewal-before-d04). It
depends on framework milestone M98o, which is designed but not yet implemented.

If status says **Cleanup required**, new launches stay blocked. Stop remaining
application processes manually if necessary and run **Setu-TS: Recheck Cleanup**;
that action only checks for disappearance. Deliberately detached descendants
and abrupt host/supervisor death are outside the cleanup guarantee. Diagnostic
TTL does not terminate application processes.

Diagnostics stay in bounded host memory and are cleared on Stop. Credentials
reach the launched application through its environment, so this is not a
sandbox against the selected application or other privileged local software.
No account, billing client, diagnostic upload or VSIX release is included.
