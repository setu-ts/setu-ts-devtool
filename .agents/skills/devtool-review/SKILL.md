---
name: devtool-review
description: Code-review or security-review a Setu-TS Devtool change (setu-ts-devtool repository, VS Code extension) against its trust, credential, data-minimization and process-ownership model. Use when asked to review a devtool branch or PR, or when a devtool change needs the independent security review AGENTS.md requires. Do NOT use for the Setu-TS framework (hono-enterprise); that repository has its own review and audit skills.
---

# Review a devtool change

`AGENTS.md` is the policy; this skill is the procedure.

## Independence

When the review is the independent security review `AGENTS.md` requires, it
must run in a context that did not implement or fix the change — a fresh
session or a freshly spawned agent, given only the branch, commit, plan and
existing reports. Record the reviewer as separate from the author, as
`docs/d03-security-review.md` does. The reviewer modifies no tracked file and
makes no commit, push or external action.

## Scope

Review `origin/main...HEAD` on the task branch. Read the plan under `plans/`
when one exists, and the sections of `docs/architecture.md`, `docs/security.md`
and `docs/framework-compatibility.md` that the diff touches.

## What to check

Correctness first: does the code do what the plan and docs claim, on the real
path rather than only a fake? Then the boundaries the security model defines:

- **Execution and workspace trust** — untrusted, virtual, remote and browser
  contexts refuse explicitly; nothing executes application code before an
  explicit launch.
- **Credentials and transport** — session credentials stay in host memory, are
  never logged, persisted or sent to the webview; lifetimes follow the
  framework's limits and are never silently extended.
- **Data minimization and display** — the webview receives only bounded,
  owned projection records; no raw DTOs, paths or launch/network authority;
  messages are versioned, exact-field, size/depth/rate bounded.
- **Process lifecycle** — every owned process is stopped on Stop, expiry,
  reload and deactivation; cleanup failure is reported, not hidden.
- **Framework pinning** — the framework revision and released-package set match
  `scripts/framework-pin.json` and the contract register; no mixed local and
  published packages.

Use the acceptance matrix in `docs/security.md` as the checklist and name the
case (`S01`…) each finding falls under.

## Output

For each finding: file and line, the failure scenario as concrete input and
observed outcome, severity, and whether it was confirmed by running something.
End with an explicit decision — approve for the stated scope, or blocked with
the findings that block. A security review is written up as
`docs/<milestone>-security-review.md` in the milestone's own PR.
