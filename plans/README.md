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
5. [D04 release](d04-release.md): release qualification of the free preview.
   Requires D03b, D06, the framework `v0.11.0` packages on npm, and editor/OS
   evidence. The plan was rebased onto `v0.10.0`; it moves to `v0.11.0` when
   D04 starts.
6. D05 free follow-ons (health summary, generator/task UI): direction only; plan
   after D04.
7. [D06 Node applications](d06-node.md): npm project discovery and launch under
   `tsx`, pinned to framework `v0.11.0`, the first release that contains M126.

Capability-specific inspectors (P03) remain follow-on work.
