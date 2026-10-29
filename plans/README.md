# Implementation sequence

Status and evidence for each milestone live in the
[roadmap milestone table](../ROADMAP.md#milestones). This list gives the order
and the canonical plan for each.

1. [D01 foundation](d01-foundation.md): native shell and safe discovery.
2. [D02 connection](d02-connection.md): explicit launch, pairing, bounded reader
   and teardown.
3. [D03 inspection](d03-inspection.md): topology, request timeline and secure
   webview.
4. [D03b renewal](d03b-renewal.md): the contract pin moved to `v0.10.0`, and
   session renewal without relaunch (framework M98o).
5. D04 release: plan pending (`d04-release.md`). Requires D03b, the published
   framework `v0.8.0` packages (which contain `@setu-ts/diagnostics-plugin`), and
   editor/OS evidence.
6. D05 free follow-ons (health summary, generator/task UI): direction only; plan
   after D04.

Capability-specific inspectors (P03) remain follow-on work.
