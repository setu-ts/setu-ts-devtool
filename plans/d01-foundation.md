# D01 — Extension foundation

Status: implemented and locally verified on `feat/d01-foundation`.
See [validation evidence](../docs/d01-validation.md); full release qualification is D04.

## Scope and dependencies

Deliver the desktop extension shell, native project tree, runtime trust/context gates,
bounded local discovery, coalesced refresh/watchers, synthetic development preview and CI.
No application execution, framework imports, credentials, network client or webview in D01.
D02 owns recipe validation/launch/pairing; D03 owns the real inspection panel.

## Verified contracts and choices

- Framework `packages/cli/src/workspace/manifest.ts`: v1 manifest, `apps/<name>`,
  member port, optional devtoolPort, absent runtime defaults to Deno. Discovery
  retains only names/ports; transportUrl and unknown fields never enter descriptors.
- VS Code extension manifest and testing documentation: native `main`, ui host,
  no browser entry; declare trust/virtual restrictions and recheck inside handlers.
- Local Code OSS version is 1.138.0. Set engine floor to this measured version;
  record embedded Node in the actual host test, separately from system Node.
- jsonc-parser visitor detects duplicate object keys and depth before parse result use.
  Reject parsing errors, depth >32, files >256 KiB, roots >16, members >64,
  invalid member names/ports/dependencies, cycles and duplicate ports.
- Node filesystem reader: canonical roots; reject symlinked descendants and files;
  open with O_NOFOLLOW/nonblocking, verify regular file, read at most limit+1.
  Root canonicalization deduplicates aliases. Active same-user filesystem races
  remain outside the isolation guarantee; launch must revalidate in D02.
- Discovery runs on visible view or explicit refresh only. A manifest is authoritative:
  invalid members invalidate the root, never trigger standalone fallback. Deno config
  gives only a candidate development task, never a claim that launch is safe.
- One running scan plus one coalesced follow-up. Invalidate results on root/context
  change/disposal; watch only known filenames under selected roots and discovered members.
  Root changes clear selection. Selection accepts only current opaque IDs, never input paths.
- Sample command is development/test only. Production build excludes the module and
  command. Sample tree is clearly marked and cannot masquerade as discovered applications.

## Files and tests

| Source                    | Consumer and test                                                          |
| ------------------------- | -------------------------------------------------------------------------- |
| src/editor/context.ts     | Command and refresh gates; test/unit/context.test.ts                       |
| src/discovery/json.ts     | Discovery parser; test/unit/discovery.test.ts                              |
| src/discovery/files.ts    | Bounded filesystem; test/unit/discovery.test.ts                            |
| src/discovery/discover.ts | Native tree descriptor producer; test/unit/discovery.test.ts               |
| src/editor/refresh.ts     | Extension scan scheduler; test/unit/refresh.test.ts                        |
| src/extension.ts          | VS Code composition and commands; test/host/index.ts                       |
| test/fixtures/sample.ts   | Development-only native preview; host test and production bundle assertion |
| scripts/build.mjs         | Bundled host/tests; npm run build and test:host                            |

## Verification and security gates

`npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run format:check`.
Actual Code OSS host: isolated user/extension directories and `--extensionTestsPath`;
assert activation, gated discovery, native selection and sample registration/production absence.
Tests cover S01/S02/S14 portions owned by D01: no reads in refused contexts,
duplicate keys, malformed/deep/oversized files, symlink escape, invalid authoritative
manifest, no recursive scan, coalescing and disposal races. Fixed errors never expose file content.
All fixtures are synthetic. No VSIX or VS Code-brand/other-OS qualification is claimed.

## Deferred work

D02 requires a fresh framework contract audit (the register is pinned to an older commit),
real process ownership evidence and helper instance-binding conformance. D04 remains the
publication and full editor matrix gate. Neither is implied by a D01 development-host pass.
