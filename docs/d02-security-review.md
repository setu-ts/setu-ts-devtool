# Independent D02 security review

Date: 2026-09-27. Reviewer: separate review agent, not the implementation author.

## Decision

**APPROVE D02 within its documented local Linux preview scope at commit
`23807e5fc48eb41da3f0e5b495bf176c3d928ac6`.** No confirmed blocking security
defect was found. This is a security review of the identified implementation,
not a guarantee that defects cannot exist or a D04 release qualification.

Reviewed range: `2615d26...23807e5`, including D02 implementation `94220ab` and
the cleanup-recheck fix `23807e5`, plus relevant unchanged D01 and pinned
framework seams. Source-tree identity: `3a9e7f8a131c703ff30a6e0b80acf4e2ddb7164b`.
The framework pin is `26aebd0e3fd16074d7b578623577fe87a1930e83`.

No tracked file was modified, no commit or push was made, and no GitHub or
external messaging action was performed by this reviewer. Scratch evidence
is under `.tmp/independent-security-review/`. No applicable AGENTS.md,
CLAUDE.md or AI_GUIDELINES.md was present in this repository or its inspected
ancestor directories; the framework repository's instructions were not treated
as instructions to modify this separate extension repository.

## Findings

No confirmed blocking or advisory security finding is reported. The following
conclusions are supported by code inspection and the tests described below:

- **Trust and consent:** Runtime local/trusted/Linux gates apply to launch;
  executable invocation occurs only after native confirmation. Selection,
  workspace membership and recipe inputs are rechecked after confirmation.
  Cancellation cannot advance an old preparation into a new launch. The dialog
  names all workspace members, the selected target, executable, root and port.
- **Executable and project inputs:** D01 reads bound JSON bytes/depth and reject
  duplicate keys and path/symlink escapes. Preflight checks complete pinned
  recipes and hashes their inputs rather than evaluating project configuration.
  Executable selection uses the global setting or canonical absolute host PATH,
  excluding workspace candidates, with bounded version and identity checks.
- **Credentials and private IPC:** Each launch generates fresh host-random
  credentials. Arguments and control IPC omit credentials; supervisor startup
  uses a minimal environment. Application bootstrap/IPC variables are removed,
  and the pinned workspace runner explicitly blanks sibling handoff variables.
  Stdio is ignored. The helper's lazy import is accounted for before clearing
  the owned key buffer. No extension diagnostic/credential persistence path was
  identified. Application code remains authorized executable code, not sandboxed.
- **Transport and model boundary:** Native HTTP requests target numeric IPv4
  loopback, canonical core paths and allowlisted headers, with no redirect or
  proxy route. Header/body limits, helper deadlines and cancellation bound the
  exchange. The pinned public helper authenticates bytes and binds both header
  and DTO identities, validates exact core schemas/cursors and freezes output.
  The extension creates owned projections and caps retention/scheduling.
- **Process ownership:** Only the live supervisor signals its own process group.
  Parent cleanup uses read-only group checks, with uncertainty blocking another
  launch. Ordinary resistant descendants and early root exit are exercised by
  real processes. No stale remembered-PID signaling fallback was found.
- **Cancellation and replacement:** Stop aborts the captured session before
  awaiting setup/cleanup; late reads cannot repopulate the capture. Clear drops
  pending old-revision events while advancing the validated cursor. The cleanup
  recheck fix independently satisfies the intended invariant: concurrent scans
  are coalesced, and results commit only against the captured owned handle,
  abort-generation object and Cleanup required state. Its rejection path keeps
  launch blocked and permits a later retry.
- **Build delivery:** Preparation pins the framework source and records artifact
  hashes; build verifies helper/catalog hashes and the source commit. Production
  bundles the public helper and separate supervisor, checks external imports,
  excludes development sample commands and allowlists packaged files/notices.
  The production build succeeded independently.

## Independently executed evidence

1. `node --test out/unit/*.test.cjs out/integration/*.test.cjs`: **49 passed,
   zero failures/cancelled/skipped**; exit 0, approximately 12.1 seconds.
   This includes real prepared standalone/workspace pairing and application
   requests, credential sibling isolation, early-root-exit and resistant-child
   cleanup, malformed supervisor controls, proxy refusal, and both committed
   cleanup-recheck regressions. Output: `tests.log`.
2. Before relying on those existing bundles, every embedded source-map entry
   corresponding to current `src/` was compared to the working tree: **21 source
   files verified, zero mismatches**. Output: `bundle-source-check.json`.
3. A separate scratch bundle of the actual extension client/transport was tested
   against an independently constructed native HTTP peer using Node HMAC and
   synthetic credentials. The probe did not import private framework signing
   or validation helpers. Results (`probes.mjs`, `probes.json`):

   | Probe                                                | Result                       |
   | ---------------------------------------------------- | ---------------------------- |
   | Reuse an earlier snapshot MAC on a later sequence    | Rejected                     |
   | Correctly sign a snapshot with nested unknown data   | Rejected                     |
   | Correctly sign an empty batch advancing the cursor   | Rejected                     |
   | Send headers and one body byte, then stall           | Rejected after 5,003 ms      |
   | Stop immediately after starting asynchronous pairing | Rejected; zero HTTP requests |

4. `node scripts/build.mjs`: **exit 0**, fresh production build; output
   `build-direct.log`. An initial `npm run build` attempt could not run because
   the `npm` executable is not on this review agent's PATH (exit 127); invoking
   the exact underlying build script succeeded.
5. Forbidden-construct source search for `new Function`, `eval(`, ` require(`,
   `as any`, `@ts-ignore`, `Date.now()` and `globalThis.__`: **no matches**.
6. Independently inspected the framework public client, core protocol validators
   and generated Deno workspace runner, rather than relying solely on the
   author's contract-audit conclusions. Reviewed the D02 security model,
   milestone plan and validation record in full.

Coverage figures and Code OSS runs in `docs/d02-validation.md` remain the
implementation author's recorded evidence. This reviewer did not rerun the
coverage command or a GUI editor matrix and does not present them as new
independent measurements.

## Scope limits and remaining acceptance work

These are documented qualification boundaries, not newly confirmed defects:

- Approval is for the exact local Linux D02 implementation and pinned helper.
  Installed VSIX behavior, published package delivery, other OS/editor versions,
  real crash qualification and the full D04 editor matrix remain outstanding.
- Native confirmation wiring has unit-double coverage; the reported Code OSS
  connection harness is not a fully automated native-dialog click-through.
- D03 still owns the actual webview/DOM/CSP, renderer IPC and presentation stress
  qualification. No webview is shipped by D02.
- The system does not isolate a malicious authorized application, same-user
  process/extension or compromised OS. Deliberately escaped descendants and
  abrupt host/supervisor death can outlive cleanup; TTL does not kill processes.
  Filesystem/executable identity checks do not eliminate active same-user races.
- Build provenance hashes protect against accidental artifact/source mismatches,
  not an attacker able to rewrite the trusted local build environment and its
  provenance metadata.

A later runtime/source change needs review of its delta before carrying this
approval forward. A documentation-only commit can preserve this approval after
confirming that its runtime source, build inputs and tests are unchanged.

## Follow-up review after PR #2 fixes

The same separate reviewer assessed `21d6105..92d7317` after the D01 review
fixes were carried into this stacked branch. Approval carries forward to
`92d7317715d0a29d34ae46bc95bee10a771e3a91` for the same local Linux scope,
with no blocking findings. Concurrent refresh callers now await their shared
coalesced cycle; invalidation and disposal behavior remains intact. The reviewer
ran both refresh tests and verified their bundle against current source.

The CI delta grants only `contents: read`, disables checkout credential
persistence, and uses immutable action commits. The implementation author
verified those commits against the upstream GitHub tags: checkout and
setup-node v4.4.0, and setup-deno v2.0.5. The full D02 type check, format check,
49-test per-file coverage gate and production build also passed after the delta.
Other security-sensitive runtime and build code is unchanged. D03 and D04
exclusions remain as stated above.
