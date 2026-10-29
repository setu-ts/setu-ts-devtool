# Setu-TS Devtool — Agent Rules

These rules apply to every assistant working in this repository. Read them
before inspecting, planning, or changing the project.

## Work only in an ignored worktree

Discover the canonical clone as the parent of Git's absolute common directory:

```sh
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
repo_root=$(dirname "$common_dir")
```

This works from the canonical checkout and every linked worktree. The canonical
clone's `main` checkout stays clean and synchronized with `origin/main`; never
edit or commit there.

Before starting work:

1. Run `git branch --show-current` and `git status --short --branch`.
2. Verify that the maintainer-provisioned local guards are installed:
   `git config --local --get alias.pr-merge` must succeed, and `pre-commit`,
   `pre-push`, `reference-transaction`, and `merge-pr` must be executable under
   `$common_dir/hooks/`. If any guard is absent, stop and ask the maintainer to
   provision this clone; do not recreate or bypass it ad hoc.
3. Fetch and prune from the canonical clone.
4. Create or reuse exactly one task branch in an ignored worktree under
   `.claude/worktrees/<task>`.
5. Base a new task branch on `origin/main`.

Example:

```sh
git -C "$repo_root" fetch origin --prune
git -C "$repo_root" worktree add \
  .claude/worktrees/d03-ui -b feat/d03-ui origin/main
```

Do not create sibling clones or worktrees beside the repository. Put scratch
files under `.tmp/`; never commit them.

## Branch and history safety

- Never commit on, push to, delete, or rewrite `main`.
- Never bypass repository hooks with `--no-verify` or replace the local hooks.
- Never force-push or otherwise rewrite a published branch. Merge `origin/main`
  into a published task branch when conflict resolution is required.
- Keep all implementation and review fixes for a milestone on its one feature
  branch until merge.
- Use `feat/<milestone>-<description>` for implementation, `docs/<description>`
  for documentation-only work, and `fix/<description>` only for defects already
  merged into `main`.
- Remove completed worktrees and local task branches after their PR merges.
  GitHub automatically deletes merged remote branches.

## Read before implementation

Read the relevant sections of `ROADMAP.md`, `docs/architecture.md`,
`docs/security.md`, and `docs/framework-compatibility.md`. Read the task plan in
`plans/` when one exists. Security-sensitive framework integrations must retain
their documented pinning, trust, authentication, redaction, bounded-data, and
process-ownership constraints.

## Required validation

Run the gates appropriate to every source change:

```sh
npm run check
npm run format:check
npm run test:coverage
npm run build
```

Read the per-file coverage table and confirm every `src` file remains at least
90% on branch, function, and line coverage. Demonstrate the behavioral change;
a passing no-op is not evidence. Renew the independent security review when a
change touches credentials, authenticated transport, build provenance, process
ownership, cleanup, trust gates, or diagnostic data boundaries.

## Pull requests and review

- Do not push, open a PR, or merge unless the user has authorized that action.
- Every PR carries the `maintainer-review` label.
- Reply to each automated review finding in its own thread and resolve it only
  after verification and correction or a documented refutation.
- Do not merge with `gh pr merge` or the GitHub web UI. Use the guarded local
  command `git pr-merge <number>` after the user authorizes merge. It requires an
  open PR targeting `main`, the maintainer label, a clean merge state, successful
  `linux` checks, and zero unresolved review threads. The alias and executable
  live in Git's shared common directory, so the command is available from every
  properly provisioned linked worktree.

The repository is public, and GitHub enforces a "protect main" ruleset on
`main`: changes arrive only through a pull request merged with a merge commit,
the `linux` check must pass, every review thread must be resolved, and
force-pushes and deletion are refused. Secret scanning and push protection are
enabled. The shared local hooks and the guarded merge command remain part of
the workflow: they check the same conditions locally, plus the maintainer
label, which the ruleset does not.
