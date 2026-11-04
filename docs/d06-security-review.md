# Independent D06 security review

Date: 2026-10-29. Reviewer: separate review agent, not the implementation
author.

## Decision

**APPROVE D06 for the documented local Linux preview scope.** The reviewer
assessed `origin/main..eb7b38a` on `feat/d06-node`: Node discovery, Node/npm
resolution and verification, the fixed npm environment, Node preflight, the
supervisor's Node launch, the prepare-step changes and the documents. That
round found one blocking finding (F1) and five low or informational ones
(F2–F6). The reviewer re-reviewed the fixes in `eb7b38a..c81f692`, found F1
still reachable through a key spelling and one test gap (N1), and re-reviewed
`c81f692..e349cb7`. All findings are closed. This is not an installed-VSIX,
published-release or cross-platform approval.

No tracked file was modified, no commit or push was made, and no external action
was performed by the reviewer.

## Revision audited

- Branch `feat/d06-node`, `origin/main..eb7b38a` (11 commits).
- Fix deltas `eb7b38a..c81f692` (`d1a1985`, `c81f692`) and `c81f692..e349cb7`.
- Framework `develop` `4e26f834` (M126); Node 24.22.1, npm 11.19.1, Deno 2.9.6.

## Scope

S01, S04, S05, S10 and S17 preconditions for the Node path:
`src/launch/{executable,credentials,supervisor,launcher,preflight,recipes}.ts`,
`src/discovery/{discover,files}.ts`, `src/editor/connection.ts`,
`src/extension.ts`, `scripts/prepare-framework.mjs`,
`scripts/framework-pin.json`, the tests and the document changes.

## Probes

- At `e349cb7`: `npm run check` and `npm run test:coverage` (105/105, none
  skipped) pass; every `src` file is at least 90% on lines, branches and
  functions.
- Provenance: an independent `git archive` at `4e26f834` matches
  `archiveSha256`; re-running the prepare step from a clean checkout reproduced
  `recipes.json` and `client.cjs` byte-for-byte. The pinned CLI's `new` and
  `generate` paths spawn nothing and fetch nothing; Prettier 3.9.10 is locked
  with integrity; fixture installs use `--ignore-scripts` and are not shipped.
- npm 11.19.1 under the fixed environment: `script-shell`, `node-options` and
  `predev`/`postdev` from a project `.npmrc` take no effect; a project `prefix`
  is refused by npm; mixed-case `npm_config_*` variables are stripped; npm
  writes no debug log even when a project `.npmrc` sets `logs-dir` and
  `logs-max`; the session key does not appear in npm's debug log.
- Script redirection: `--no-workspaces` makes the launch's npm run its own
  package's `dev`, or fail closed on a configured `workspace`, including for a
  project nested in a parent npm workspace. Preflight refuses, on the real
  workspace fixture, a root `.npmrc` with `${npm_package_name}=worker` (root
  package named `workspace`), a lone-CR separator, a JSON-escaped quoted key, a
  BOM-prefixed `workspace`, `Include_Workspace_Root`, backslash keys and
  `[section]` lines, and accepts `@scope:registry=`. Plain keys `w`, `ws`,
  `workspace-root` and `iwr` are not workspace selectors to npm; `global` and
  `location=global` fail closed in the runner.

## Negative controls

| Mutation                                                      | Result                               |
| ------------------------------------------------------------- | ------------------------------------ |
| Drop `node_options`, `ignore_scripts` or `script_shell`       | Both hostile-`.npmrc` exercises fail |
| Case-sensitive or removed `npm_config_*` filter               | Unit test fails                      |
| Accept a non-`npm-cli.js` npm; accept Node 26, 24.10, 24.22.0 | Unit tests fail                      |
| Drop `--no-workspaces`                                        | Parent-workspace exercise fails      |
| Drop the plain-key refusal or the `[]` normalization          | Spelling unit test fails             |
| Look npm up beside the configured path; drop the verify `cwd` | Unit test fails                      |
| Accept any sibling script; drop the `tsx` presence check      | Unit tests fail                      |
| Drop the Bun refusal (manifest or lock file)                  | Unit test fails                      |

## Findings

- **F1 (medium, S05/S04): closed.** A project `.npmrc` could select another
  package's `dev` script (`workspace`, `workspaces`, `include-workspace-root`,
  or through `userconfig`/`globalconfig`), which then ran with the session
  credentials; confirmed through the real launch path. The first fix's key
  denylist was bypassed by an environment-variable key
  (`${npm_package_name}=worker`, confirmed end to end), a quoted key and a
  lone CR. Now: the launch runs `npm --no-workspaces run dev`, and preflight
  splits lines as ini does, refuses any key outside a plain character set, and
  refuses the redirecting keys in any case or separator spelling.
- **F2 (low, test gap): closed.** A test has npm link into the root while node
  stays outside it.
- **F3 (low, S05): closed.** The launch refuses a prepared descriptor whose
  runtime differs from the selection.
- **F4 (low, S01): closed.** `verifyNode` runs from npm's own directory.
- **F5 (informational): closed.** npm is found beside the resolved node, as
  the child `PATH` finds it.
- **F6 (informational): closed.** The watcher includes `package.json` and
  `.npmrc`; npm writes no debug log.
- **N1 (low, test gap): resolved by removal.** The fresh descriptor's runtime
  check could not fire alone: a runtime change changes the files preflight
  reads, so the fingerprint comparison already refuses it.

- **F7 (medium, S05/S04): fixed; see [ancestor lookup](#ancestor-path-lookup-f7--2026-11-04).**
  `npm run` searches `node_modules/.bin` of every directory above the launch
  root before the verified node, so a `node` there ran with the session key.

## Limits

The reviewer did not exercise a real Code OSS host, an installed VSIX, the
published framework release containing M126, or platforms other than Linux.
`provenance.json` is self-attested by the prepare step and does not record the
Prettier version that shapes the Node recipes. Same-user filesystem races
between verification and spawn remain outside the guarantee, as for Deno.
Workspace `node_modules` content (`tsx`, `.bin`) is application code that the
launch confirmation authorizes.

## Pin move to v0.11.0 — 2026-11-04

A fresh review agent, not the author of the change, assessed
`abceda2..8f30803`, which moves the pin from `4e26f834` to the `v0.11.0`
release commit `446d9472`. **Decision: approve.**

- **Framework diff.** `4e26f834` is an ancestor of `446d9472`, and the remote
  tag `v0.11.0` resolves to it. On the diagnostics surface, the only change is
  `redis` added to the trace instrumentation kinds (diagnostics plugin and
  `common`); the kernel collector has no diff. The CLI's devtool sources, the
  workspace runner and the runtime package are unchanged apart from versions.
  Generator inputs that did change (new runtime-profile test fields, the flat
  module layout, new root `test`/`build`/`deploy` scripts) weaken no gate:
  preflight compares only the root `dev` script, pre/post scripts stay
  disabled, and sibling `start:dev` scripts are regenerated from the pinned CLI.
  The locked `hono`, `@hono/node-server`, `tsx` and Prettier versions are
  identical.
- **Provenance.** The prepare step and `build.mjs` refuse a different or dirty
  commit and the wrong Deno version. The reviewer recomputed the archive,
  prepared-tree, `client.cjs` and `recipes.json` hashes and found them equal to
  `provenance.json`, which names `446d9472`.
- **Documents.** The `redis`, release-date, "unchanged" and lock claims hold.
  One informational finding: the documents said only "entries" from
  `cli@0.10.0` are refused, but a Deno workspace runner is refused too, because
  it names the CLI version. Corrected in the validation record and the contract
  register. No extension release has shipped, so no user is affected.
- **Gates rerun by the reviewer at `8f30803`:** `check`, `test:coverage` (105
  tests) and `build` exited zero.

Limits: the reviewer read the published-scaffold logs but did not rerun them or
the host runs, and did not audit the M117 Redis adapter or M122 deploy code,
which the devtool does not load. Credentials, transport, process lifecycle and
data minimisation are untouched by this range.

## Ancestor PATH lookup (F7) — 2026-11-04

Found by a code review in the session that moved the pin, which did not write
the D06 code but is not independent of this fix.

`npm run` puts `node_modules/.bin` of the package directory and of every
directory above it, up to `/`, ahead of the verified node on `PATH`. The chain
looks up `node` (the workspace root script and `tsx`'s `#!/usr/bin/env node`),
`npm` (the workspace runner) and `tsx` by name. A `node` wrapper placed above
both published `cli@0.11.0` scaffolds ran with `SETU_DEVTOOL_SESSION_KEY` while
the launch paired normally and the confirmation named the verified node.
Another local user who can write to a directory above a project (for example
under `/tmp`) could take the session that way.

Fix: Node preflight requires an executable `node_modules/.bin/tsx` in the
launch root, so every `tsx` lookup ends inside it, and refuses when
`node_modules/.bin/node` or `node_modules/.bin/npm` exists, in any form, in any
directory above the root. An unreadable directory on that path is refused too.
Both preparations run the check, the second immediately before launch. Evidence
and the negative control are in the [validation record](d06-validation.md).
Projects inside a JavaScript repository whose `node_modules/.bin` has neither
`node` nor `npm` are unaffected. A directory above the root that gains one
between the second preparation and the spawn is outside the guarantee, like the
same-user races below.

**Independent re-review: approved for its stated scope.** A separate agent,
not the author, assessed `36cbbd3..b446685`. From npm 11's
`@npmcli/run-script` it confirmed that the lookup directories outside the root
are exactly the root's ancestors (member scripts walk through `apps/` and the
root first), that `project.root` and npm's working directory are both physical
paths, and that the names looked up are `node`, `npm`, `tsx` and npm's default
shell `sh`. It ran the reproduction, its positive control and the full suite.

- **A (medium, S05/S04): fixed.** The runner's nested `npm run dev` has no
  `--no-workspaces`. npm walks up from the member to the first `package.json`
  whose `workspaces` include it; a root whose `workspaces` missed the member let
  that walk reach an ancestor, whose `.npmrc` `workspace=` ran another package's
  `dev` with the session key (reproduced on the published workspace). First
  fixed by requiring the root `workspaces` to contain `apps/*`; see the
  follow-up for two bypasses of that fix.
- **B (low, false refusal): fixed.** A `tsx` installed only in the member still
  passed the package check but failed the root `.bin` check. The member clause
  is removed: a sibling's lookup would not reach the member's `.bin`, so the
  root must hold `tsx`.
- **`sh` (informational): documented.** An ancestor `node_modules/.bin/sh`
  received the session key under npm's default script shell. The fixed
  `npm_config_script_shell=/bin/sh` prevents it; `docs/security.md` now names
  that setting as load-bearing.
- **C (informational): accepted.** A project under a directory with the `node`
  or `npm` package installed is refused with the generic preparation message.
- **D (informational): documented** in `docs/security.md` as a limit of a
  check without a lock.
- **E (informational): accepted.** The unreadable-directory case does not fail
  as root, which CI does not run as.

A and B were fixed in the authoring session after this re-review; see the
follow-up below.

### Follow-up re-review of the A and B fixes

A separate agent assessed `b446685..95b52e8`. **Decision: changes needed**,
for two bypasses of the A fix, both reproduced on the published workspace:

- **A1 (medium, S05/S04): fixed.** A `!apps/api` entry, in any position,
  removes the member from npm's map of the root's workspaces even with `apps/*`
  listed, so the walk continues to an ancestor `.npmrc`.
- **A2 (medium, S05/S04): fixed.** An `apps/package.json` whose `workspaces`
  include the member ends the walk inside the project, and npm then loads
  `apps/.npmrc`, which preflight never read.

Preflight now also refuses a non-string or `!`-containing `workspaces` entry and
any `apps/package.json` or `apps/.npmrc`. The object form `{ packages: […] }` is
refused, which the CLI never writes. The re-review found B correct and confirmed
the `sh` and limits statements; other edge cases it checked (duplicate package
names, an unreadable member manifest, symlinked members, member names with
glob characters, a member declaring `workspaces`) make npm fail closed or
cannot occur.

### Review of the A1/A2 fix

A separate agent assessed `95b52e8..21f47c8`. **Decision: changes needed.**
It confirmed the A1/A2 fix and that the walk starts at the member's physical
directory, and found:

- **C1 (medium, S05/S04): fixed.** With `apps/` searchable but not readable
  (mode 0311, which an archive can carry), npm's workspace glob at the root
  fails silently and returns no members, so the walk continues to an ancestor
  whose `workspaces` name the member literally; its `.npmrc` `workspace=` ran
  another package's `dev` with the session key (reproduced end to end).
  Preflight never lists `apps/`, so it could not see this. Rather than chase
  each way npm's map can miss a member, preflight now refuses a workspace
  launch when any directory above the root has a `package.json` that declares
  `workspaces`, or one it cannot read or parse. A, A1 and C1 all depend on such
  a directory. The cost is that a Setu-TS workspace nested inside another npm
  workspace is refused.
- **Low: accepted.** A harmless user-added `!libs/…` entry is refused.
- **Informational.** The `apps/.npmrc` refusal is redundant once
  `apps/package.json` is refused, and kept.

### Review of the C1 fix

A separate agent assessed `21f47c8..af2a1db`. **Decision: approve.** It
compared npm 11's walk condition (`isFile()`, `normalize`, a truthy
`workspaces`) with the new check and found preflight stricter on every point,
the visited directories identical (both physical paths, both including `/`), and
no way for the walk to end below the root other than the refused
`apps/package.json`. It reran the C1 reproduction and the unmodified workspace.

- **L1 (low, availability): fixed.** The ancestor `package.json` was opened
  blocking and read without a bound: a FIFO there hung preflight, and a link to
  `/dev/zero` read hundreds of megabytes before failing. It is now opened
  non-blocking, refused unless it is a regular file within the size bound, and
  read with a bounded buffer, as discovery reads. A test plants both; with the
  old read, the FIFO case hangs. This fix follows the reviewer's suggestion and
  was not reviewed again.
- **Accepted.** Anyone who can write a shared directory above a project can
  block its workspace launches, without reaching its credentials.

## Automated PR review — 2026-11-05

CodeRabbit raised two findings on the pull request, outside the diff range.

- **User and global npm configuration (major, S05/S04): fixed.** A
  `workspace=worker` in `~/.npmrc` made the runner's nested `npm run dev`
  run the sibling's unchecked `dev` script, which received the session key
  (reproduced on the published workspace). The suggested fix, both paths set to
  `/dev/null`, makes npm refuse every launch ("double-loading config"), so the
  launch environment sets them to two distinct paths below `/dev/null`, which
  npm reads as empty. The hostile-configuration exercise now writes a user
  `.npmrc`; without the setting both launches end Failed instead of Live.
- **Bun lock file beside other manifests (major, plan conformance): fixed.**
  Discovery refused `bun.lock`/`bun.lockb` only for a standalone Node root; the
  plan refuses any root that has one. It now does, for Deno and workspace
  roots too.

A separate agent reviewed `826b9d5..2121255`. **Decision: approve.** It
confirmed by running that the environment values outrank user and global
configuration for both the outer and nested npm (also with `PREFIX` pointing
at a global `npmrc`), that real launches of both published scaffolds still
pair, and that the Bun change matches the plan. One low residual is accepted:
npm's builtin `npmrc` in its installation directory can still set
`workspace`, and nothing in the environment overrides it. It is part of the
verified npm, which is refused inside a workspace root; nvm installs ship none
and `npm config set` never writes it. Global configuration is covered by the
unit assertion and the reviewer's probes, not by an integration exercise.

## Verdict

Passed, including the pin move to `v0.11.0` and the F7, A, A1, A2 and C1
fixes. The L1 hardening follows the last review's suggested fix and was not
reviewed again.
