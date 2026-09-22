# Setu-TS Devtool

Local development companion for Setu-TS applications and monorepos.

**Status: implementation planning.** There is no extension, executable scaffold,
or released diagnostics integration in this repository yet. Framework M98a, M98b
and M98c are implemented but unpublished, awaiting the next release cycle after
M99. This repository does not implement the framework milestones.

The first release is a free desktop extension for VS Code and Code OSS. Its main
workflow is: select a local project, explicitly launch an instrumented Deno
application, inspect plugins and routes, and follow request execution through
middleware and handlers. Diagnostic data stays local and in memory. No account
is required.

## Planning documents

- [Product roadmap and Free/Pro boundary](ROADMAP.md)
- [Framework contracts and compatibility gates](docs/framework-compatibility.md)

Next to write: extension architecture (`docs/architecture.md`), security model
(`docs/security.md`), implementation sequence (`plans/README.md`), and canonical
D01–D04 plans listed in the roadmap.

## Working alongside the framework

Keep the framework and devtool in separate Git repositories. Open a worktree
from each in a multi-root editor workspace. Changes to framework APIs belong in
the framework repository and its own milestone branch. Each devtool
implementation milestone gets its own branch and keeps its follow-up fixes there
until merge.

The contract register is pinned to merged framework commit
`6de620d6206e087c601c6067786f6b4d8a219ca6`. It covers M98a–c source contracts,
generated development entries, credential handoff and integration gaps. Local
D02 experiments can use artifacts from that revision before publication; editor
compatibility and released package availability still need separate evidence.

No package install, build, or test commands are available yet. D01 creates the
toolchain and documents its measured editor/tool versions. Planning verification
consists of Markdown formatting, relative-link checks, dependency/contract
review, and a clean Git diff.
