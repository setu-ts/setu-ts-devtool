# D03b local validation — 2026-10-29

D03b is qualified on `feat/d03b-renewal`. This record covers the contract pin
move to framework `v0.10.0` and session renewal. No VSIX was built, installed or
published; that remains D04 work.

## Environment and commands

- Linux x64; Node 24.22.1; npm; Deno 2.9.6.
- Code - OSS 1.138.0, embedded Node 24.19.0 and Electron 42.11.10.
- Framework contract pin: `d7a04734be8a4658774c7fe5b5e30297d5103ef3`
  (`v0.10.0`), prepared from a clean checkout with
  `npm run prepare:framework`.

```sh
npm run check
npm run format:check
npm run test:coverage
npm run build:dev && npm run test:host
npm run build
npm run test:host -- --production
npm run test:host -- --restricted
```

All commands exited zero. The coverage command ran **80 tests** with no
failures or skips, and its per-file gate accepted every `src` and `webview` file
at or above 90% for lines, branches and functions. The three host runs wrote
evidence with `passed: true`: development and production-bundle with a live
connection, restricted mode with none.

## Behavioural evidence

| Exercise                            | Result                                                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pin move alone                      | Before any renewal code, the existing real standalone and workspace launch, pair, capture, Clear and Stop exercises passed on the new pin (66 tests)                                                                                                          |
| Published `cli@0.10.0` scaffold     | `npx @setu-ts/cli@0.10.0 new demo --runtime deno --devtool`, then `deno install`. Discovery found it, preflight accepted its entry and tasks unchanged, and it paired: `remainingMs` 899,767, `maxRemainingMs` 28,799,767, renewable                          |
| Real renewal policy, 8 minutes      | Same scaffold, production policy: one renewal at about 7.5 minutes, after which the window read 870,087 ms (back near 15 minutes) and the maximum 28,319,772 ms. Stop left no listener on the diagnostics port                                                |
| Renewal through the generated entry | Integration test: renewal scheduled one second after each lifetime; at least two real `GET /v1/renew` calls succeeded and the session stayed Live with a full window                                                                                          |
| Capped renewable session            | Entry edited to `ttlMs: 3000, maxSessionLifetimeMs: 7000`: renewed repeatedly, stopped at its deadline after about 7.3 s with `ended: "deadline"`, no listener left                                                                                           |
| Session without renewal             | Entry edited to `ttlMs: 3000` only: shown as not renewable, stopped at about 3.3 s, and no renew call reached the client                                                                                                                                      |
| Status bar text                     | Live and renewable: "Session renews automatically; up to 7 h 59 min left in total." Not renewable: "Session ends in N min and cannot be renewed. Launch again to continue." After a deadline stop: "Session ended at its deadline. Launch again to continue." |

## Negative controls

Each mutation was applied to a source file, tested, and reverted:

| Mutation                                   | Failing tests                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Transport refuses `/v1/renew`              | Transport allowlist, client lifetime integration, real renewal and real capped-session exercises |
| Renew without advertised support           | Real session-without-renewal exercise                                                            |
| Retry once after a failed renewal          | "a failed renewal stops the launch once, without a retry"                                        |
| Do not re-arm the deadline after renewal   | "a renewal re-arms the deadline from its own send time"                                          |
| Drop the 3,600,000 ms window bound         | Lifetime projection test                                                                         |
| Read the pairing send time after the reply | "deadlines are measured from the send time, so a slow answer shortens them"                      |

The independent review ran further controls; see the
[D03b security review](d03b-security-review.md).

## Not covered

A real 8-hour session reaching its cap with the generated entry, host suspend,
installed VSIX, published-package bundling and platforms other than Linux. D04
owns the last three.
