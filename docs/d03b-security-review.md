# Independent D03b security review

Date: 2026-10-29. Reviewer: separate review agent, not the implementation
author.

## Decision

**APPROVE D03b for the documented local Linux preview scope.** The reviewer
assessed `faadc64..03fa9a5` on `feat/d03b-renewal`: the plan, the framework
contract pin move to `v0.10.0` (`d7a04734be8a4658774c7fe5b5e30297d5103ef3`),
session renewal, and the document updates. No blocking finding was found. One
low-severity test gap was found; it is fixed (see "After the review"). This is
not an installed-VSIX or cross-platform approval; those remain D04 gates.

No tracked file was modified, no commit or push was made, and no external action
was performed by the reviewer.

## Revision audited

- Branch `feat/d03b-renewal`, commits `4359937`, `901af43`, `18d5e84`,
  `1c4954d`, `03fa9a5`; base `faadc64` (`origin/main`).
- Framework source prepared at `d7a04734` (tag `v0.10.0`); Node 24.22.1,
  Deno 2.9.6.

## Scope

S09 (expiry and error handling), the transport allowlist (S07/S08), S11 (late
callbacks), S15 (Stop clears state), S04 (credential exposure) and the build
provenance of the bundled client and recipe catalog (S17 preconditions). The
files reviewed were `src/diagnostics/{transport,client,validate}.ts`,
`src/session/{lifetime,scheduler,controller}.ts`, `src/editor/connection.ts`,
`scripts/{prepare-framework,build,framework-integrity}.mjs`,
`scripts/framework-pin.json`, the new and changed tests, and the document
changes.

## Method

The reviewer read the diff and checked it against `plans/d03b-renewal.md`,
`docs/security.md`, `docs/architecture.md`, `docs/framework-compatibility.md`
and the framework source at the pin (`client/client.ts` `session()`/`renew()`,
`protocol/protocol.ts` `parseRenewBody`, `plugin/diagnostics-plugin.ts` bounds,
`transport/limits.ts`, `cli/src/devtool/dev-entry.ts`). The reviewer then ran
the gates, a hostile-input probe and source mutations.

## Probes

- `npm run check`, `npm test` (61/61), `npm run test:coverage` (79/79, none
  skipped, including the real renewal, capped-deadline and fixed-deadline
  exercises) and `npm run format:check` all pass. Every changed `src` file is at
  least 90% on lines, branches and functions.
- `lifetimeProjection` was given 23 inputs. It refuses NaN, ±Infinity,
  fractional, negative and string values, a window above 3,600,000 ms, a
  maximum below `expiresInMs` or above 43,200,000 ms, extra keys at either
  level, an array, undefined or missing `renewal`, a JSON `__proto__` key and an
  inherited `maxRemainingMs`. Accepted results are fresh frozen copies.
- Provenance: an independent `git archive` of `packages`, `tsconfig.base.json`
  and `LICENSE` at `d7a04734` matches the recorded `archiveSha256`. The
  recomputed prepared-tree, client and recipe hashes match `provenance.json`.
  The bundled client contains only prepared framework sources.
- The transport allowlist change is limited to adding `renew` to the anchored
  `status|snapshot` alternation. Verb, body, header and base-prefix checks and
  the events query grammar are unchanged.
- Session status, including lifetime, reaches only the status bar. The tooltip
  and bar text carry only whole-minute durations. No new logging, persistence or
  webview message was added.

## Negative controls

Each mutation was applied, tested and reverted:

| Mutation                                                                 | Result                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Renew when the status did not advertise renewal                          | Fails two lifetime unit tests and the real fixed-session exercise             |
| Swallow a renewal failure (retry)                                        | Fails the scheduler test                                                      |
| Remove the 3,600,000 ms window bound                                     | Fails the projection test                                                     |
| Admit `/v1/renew` with a query                                           | Fails the transport test                                                      |
| Drop the client's paired-instance guard on `renew()`                     | Fails the transport/client integration test                                   |
| Remove both stale-renewal guards                                         | Fails "a renewal answered after Stop cannot re-arm or repopulate the session" |
| Keep the lifetime after Stop                                             | Fails two controller tests                                                    |
| Read the renewal or pairing send time after the reply                    | **Not detected**, see F1                                                      |
| Tamper with a prepared framework file, add a file, or alter `client.cjs` | `npm run build` refuses with an integrity mismatch                            |

## Findings

- **F1 (low, S09, test gap).** `src/session/controller.ts` correctly reads the
  send time before the pairing and renewal requests, but no test failed if
  either read moved after the reply. The fakes answered immediately and
  `performance.now()` is not mocked.
- Informational: `lifetimeProjection` read `maxRemainingMs` twice, so an
  accessor property could pass the bound and then return another value. This is
  unreachable from the pinned client's frozen plain-data result. The devtool
  relies on the authenticated server, not a local check, for the maximum
  lifetime never moving later; a hostile application holding its own session
  key can report any maximum, which is within the existing trust model.

## After the review

- F1 is closed by a controller test whose fake `session()` and `renew()` take
  120 ms of real time; it asserts the remaining window is shorter by at least
  100 ms. Moving the pairing send-time read after the reply makes that test
  fail (observed).
- `lifetimeProjection` now reads each field once before checking it.

## Limits

The reviewer did not exercise a real Code OSS host, the 7.5-minute real
renewal, an installed VSIX, published packages, or platforms other than Linux.
The first two are recorded in the [D03b validation](d03b-validation.md); the
rest are D04. `provenance.json` is still self-attested by the prepare step. Test
fixtures resolve npm ranges from the registry.

## Verdict

Passed.
