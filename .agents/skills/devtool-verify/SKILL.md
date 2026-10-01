---
name: devtool-verify
description: Verify a change in the Setu-TS Devtool VS Code extension (setu-ts-devtool repository, Node/npm/TypeScript) — run its npm gates, read the per-file c8 coverage table, and demonstrate the behaviour. Use only for setu-ts-devtool work. Do NOT use for the Setu-TS framework (hono-enterprise, Deno); that repository has its own verify skills.
---

# Verify a devtool change

`AGENTS.md` is the policy; this skill is the procedure. Read `AGENTS.md` first
if it is not already in context.

## 1. Confirm where you are

```sh
git branch --show-current
git status --short --branch
```

Work happens in an ignored worktree under `.claude/worktrees/<task>`, never on
`main`. Verify the committed tree: if `git status --short` shows changes you did
not make, stop and report rather than stashing.

## 2. Run the gates

```sh
npm run check
npm run format:check
npm run test:coverage
npm run build
```

A framework checkout prepared at the pin in `scripts/framework-pin.json` is
required first (`npm run prepare:framework -- <clean-pinned-framework>`).
Preparation refuses a different or dirty tree; report that as a blocker, do not
work around it.

When the change touches the editor host, launch, pairing or the webview, also
run the host tests the README lists (`npm run build:dev && npm run test:host`,
then `npm run build && npm run test:host -- --production` and
`-- --restricted`). They need a graphical session and `code-oss` on PATH; if
either is missing, say the host lane was not run. A missing lane is an open
gate, never a pass.

## 3. Read coverage per file

`c8` is configured with `perFile` and `checkCoverage`, but read the table
yourself. Every `src` and `webview` file must be at least 90% on branch,
function and line. Paste the rows for every file the change touched, and
compare them with the previous numbers: a drop is a finding even above 90%.

## 4. Demonstrate the behaviour

A green gate does not prove the change does anything. For a fix, show the test
failing without the fix and passing with it. For new behaviour, pick the lane
that actually reaches it and show the observed output:

- **Launch, pairing, transport, process cleanup** — `npm run test:integration`
  drives the session against a real prepared Deno application with no editor.
- **The same path inside the editor** — the trusted host runs
  (`npm run test:host`, then `-- --production`) launch and pair a real
  standalone and workspace project in the Code OSS extension host. They call
  the session controller directly, not the **Setu-TS: Launch** command, so they
  do not prove the command's prompts or confirmation.
- **Trust refusal** — `npm run test:host -- --restricted` proves discovery and
  launch stay refused in an untrusted window.
- **Panel interaction** (graph, timeline, filters, paging, selection) — the
  bundled webview tests, part of `npm run test:coverage`. The host runs only
  prove the packaged panel starts and its bridge acknowledges.
- **Anything only visible through the UI**, such as the Launch confirmation,
  status text or a command's prompts — no automated lane covers it. Check it
  by hand in the F5 development host and say in the report that it was a
  manual check.

## 5. Report

Return: branch and commit, each gate's exit status, the per-file coverage rows,
the behavioural evidence, and anything not run with the reason. Flag whether the
change touches credentials, authenticated transport, build provenance, process
ownership, cleanup, trust gates or diagnostic data boundaries — if it does,
`AGENTS.md` requires a renewed independent security review (see the
`devtool-review` skill).
