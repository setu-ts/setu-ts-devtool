# Independent D03 security review

Date: 2026-09-28. Reviewer: separate review agent, not the implementation
author.

## Decision

**APPROVE D03 for the documented local Linux preview scope.** The reviewer
assessed D03 implementation commit `27dbcfa` and the final qualification delta
on `feat/d03-inspection`. No blocking security finding remains after the
closed-panel lifecycle correction described below. This is not an installed-VSIX
or cross-platform release approval; those are D04 gates.

No tracked file was modified, no commit or push was made, and no external action
was performed by the reviewer.

## Review scope and outcome

The review inspected the D03 host-to-renderer boundary, including the bounded
display projection; generation/versioned exact-field message decoder; selection,
filter and documentation controls; fixed external destination map; panel
lifecycle; CSP; packaged resource roots; and dev-only fixture separation.

The review initially reported an S15 lifecycle defect: listener registrations
were stored in `ExtensionContext.subscriptions`, retaining a closed panel and
its filter/selection/session reference until extension deactivation. The final
delta resolves it. `InspectionPanel` owns those three listener disposables,
clears selection/page/rate state, disposes all listeners and closes the native
panel. The regression verifies every panel listener set is empty after close.

No other blocking static issue was found. In particular:

- The webview receives only owned, bounded projection records; credentials,
  raw DTOs, paths and launch/network authority do not cross the bridge.
- The webview uses text nodes and a fixed CSP with nonce-only script, packaged
  style/resource roots and `connect-src 'none'`.
- Incoming messages require protocol version, current generation (apart from
  the no-authority initial ready handshake), exact fields, bounded size/depth
  and rate; identifiers are checked against the current display model.
- Renderer actions are limited to bounded display controls and three fixed
  HTTPS documentation destinations. There is no renderer launch, filesystem,
  arbitrary URL or transport primitive.

## Qualification boundary

The reviewer requested final evidence after the lifecycle correction: complete
gates, production artifact search excluding source maps, and actual Code OSS
development-host/CSP exercise. Those checks are recorded in
[D03 validation](d03-validation.md). D04 must still qualify installed VSIX
contents, published dependencies and additional editor/OS configurations.
