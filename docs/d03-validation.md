# D03 local validation — 2026-09-28

D03 is qualified on `feat/d03-inspection` after the D03 implementation commit
`27dbcfa`. This record covers the subsequent qualification corrections: the
packaged webview inclusion rule, visible filter/selection/documentation actions,
and replacement of stale unacknowledged frames. No VSIX was built, installed or
published; that remains D04 work.

## Environment and commands

- Linux x64; Node 24.18.0; Bun 1.4.2 (used because `npm` is unavailable on this
  machine); Deno 2.9.6.
- Code - OSS 1.138.0, embedded Node 24.19.0 and Electron 42.11.8.
- Framework contract pin: `26aebd0e3fd16074d7b578623577fe87a1930e83`.

The exact repository scripts were run through Bun, which executes the declared
Node commands unchanged:

```sh
bun run format:check
bun run check
bun run test:coverage
bun run build:dev
bun run test:host
bun run build
bun run test:host -- --production
bun run test:host -- --restricted
```

All commands exited zero. The coverage command ran **62 tests**, with no
failures, skips or cancellations, and its per-file gate accepted every source
file (including `webview/main.ts`) at or above 90% for branches, functions and
lines. The final build produced `dist/extension.cjs`, `dist/supervisor.mjs`,
`dist/webview/main.js` and `dist/webview/style.css`.

## Behavioral and artifact evidence

| Exercise                        | Result                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development Code OSS host       | Registered and opened the inspection panel through the explicit sample command, then closed it; trusted discovery and real D02 standalone/workspace connection exercises passed.                        |
| Production-bundle Code OSS host | The sample command was absent; opening and closing the real inspection panel and D02 connection exercises passed.                                                                                       |
| Restricted Code OSS host        | Discovery/launch remained refused and no live connection was created.                                                                                                                                   |
| Renderer behavior               | Text-node rendering showed bounded graph nodes, relationships, timeline records, quality/loss state, filters, selection and fixed documentation actions; it acknowledged only host frames.              |
| Lifecycle                       | Clear/Stop and externally changed native capture replace an outstanding frame; closing a panel disposes timers and the native panel without retaining renderer state.                                   |
| Artifact boundary               | The production extension/webview assets contain no development sample marker, fixture path or temporary framework path. The webview bundle contains no `node:`/`Deno`/`require` import.                 |
| CSP/resources                   | The host bundle contains the fixed nonce-only script CSP with `connect-src 'none'`; `localResourceRoots` is only `dist/webview`; `.vscodeignore` explicitly includes those two packaged webview assets. |

The real editor harness creates a fresh temporary Code OSS profile per mode. It
exercises command registration, panel creation and disposal in the actual
embedded extension host; browser-DOM interaction and hostile-message branches
are covered by the separately bundled browser test rather than browser
automation. This is local Linux development-host evidence, not installed-VSIX
or multi-platform qualification.

## Coverage

| Source                         |    Branch % | Function % |    Line % |
| ------------------------------ | ----------: | ---------: | --------: |
| `src/extension.ts`             |       92.39 |        100 |     98.55 |
| `src/diagnostics/*`            |   97.29–100 |        100 |       100 |
| `src/discovery/*`              | 92.00–94.73 |        100 | 99.44–100 |
| `src/editor/*`                 |   90.90–100 |        100 | 99.10–100 |
| `src/launch/*`                 |   91.42–100 |  90.90–100 | 92.10–100 |
| `src/model/capture.ts`         |         100 |        100 |       100 |
| `src/model/presentation.ts`    |       92.00 |        100 |     97.86 |
| `src/presentation/panel.ts`    |       92.98 |        100 |       100 |
| `src/presentation/protocol.ts` |       96.66 |        100 |     99.31 |
| `src/session/*`                |   96.20–100 |  92.85–100 | 99.25–100 |
| `webview/main.ts`              |       96.96 |        100 |       100 |

The independent assessment is recorded in
[D03 security review](d03-security-review.md). D04 still owns installed-VSIX,
published-framework, broader editor/OS and stress qualification.
