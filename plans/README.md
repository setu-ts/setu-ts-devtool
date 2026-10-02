# Implementation sequence

Status and evidence for each milestone live in the
[roadmap milestone table](../ROADMAP.md#milestones). This list gives the order
and the canonical plan for each.

1. [D01 foundation](d01-foundation.md): native shell and safe discovery.
2. [D02 connection](d02-connection.md): explicit launch, pairing, bounded reader
   and teardown.
3. [D03 inspection](d03-inspection.md): topology, request timeline and secure
   webview.
4. D03b session renewal: plan pending (`d03b-renewal.md`). Blocked on framework
   milestone M98o (designed, not yet implemented); see the
   [roadmap section](../ROADMAP.md#d03b--session-renewal-before-d04).
5. D04 release: plan pending (`d04-release.md`). Requires D03b, a published
   framework release containing `@setu-ts/diagnostics-plugin`, and editor/OS
   evidence.
6. D05 free follow-ons (health summary, generator/task UI): direction only; plan
   after D04.

Capability-specific inspectors (P03) remain follow-on work.
