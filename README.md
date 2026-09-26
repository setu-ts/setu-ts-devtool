# Setu-TS Devtool

Local development companion for Setu-TS applications and monorepos.

**Status: D01 foundation implemented; local qualification recorded in
[validation evidence](docs/d01-validation.md).** The extension discovers local
projects and supports selection and an explicit development sample. Live launch,
pairing and inspection remain D02/D03 work. Framework M98 development continues
separately; this extension does not yet consume those packages.

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
- [Framework addons: dependencies and review boundaries](docs/framework-addons.md)

The architecture and security documents describe the full preview target. See the
[implementation sequence](plans/README.md) and [D01 plan](plans/d01-foundation.md)
for the implemented subset; later security acceptance cases remain pending.

## Working alongside the framework

Keep the framework and devtool in separate Git repositories. Open a worktree
from each in a multi-root editor workspace. Changes to framework APIs belong in
the framework repository and its own milestone branch. Each devtool
implementation milestone gets its own branch and keeps its follow-up fixes there
until merge.

The contract register is pinned to merged framework commit
`f89fd615ad2d4b15d4dfc1e12ed74e51857db025`. It covers core M98a–c contracts
and current M98d–g client additions,
generated development entries, credential handoff and integration gaps. Local
D02 experiments can use artifacts from that revision before publication; editor
compatibility and released package availability still need separate evidence.

## Develop and verify

Use Node 24 and npm. Open this repository in local desktop Code OSS on Linux.
The measured engine floor is 1.138.0; other editor versions are not qualified yet.

```sh
npm ci
npm run check
npm run format:check
npm test
npm run build:dev
npm run test:host
npm run build
npm run test:host -- --production
npm run test:host -- --restricted
```

Host tests require a graphical session and `code-oss` on PATH (or set
`SETU_TEST_EDITOR` to an editor executable). Each uses isolated profiles and a
synthetic workspace under `.tmp/`. CI currently runs the non-GUI gates only.

Press F5 to start the development extension host. Open **Setu-TS Projects** in
Explorer or run **Setu-TS: Refresh Projects**, then select a discovered project.
Selection does not execute application code. Discovery accepts standalone Deno
configs importing Setu packages and v1 `setu.workspace.json` manifests with
members under `apps/<name>`. A discovered `dev` task is only a launch candidate.

For a synthetic preview, the development host's Debug Console can invoke
`vscode.commands.executeCommand("setuDevtool.sample")` while paused in extension
code with `vscode` in scope. The command is intentionally absent from the
production bundle and command palette. Refresh returns to real project discovery.

This milestone creates no network connection, account, billing integration or
VSIX release. The [D02 plan](plans/d02-connection.md) and [contract audit](docs/d02-contract-audit.md)
are ready. Live pairing acceptance requires a framework instance-binding fix
and requalification of the resulting revision.
