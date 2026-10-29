# Implementation sequence

Status and evidence for each milestone live in the
[roadmap milestone table](../ROADMAP.md#milestones). This list gives the order
and the canonical plan for each.

1. [D01 foundation](d01-foundation.md): native shell and safe discovery.
2. [D02 connection](d02-connection.md): explicit launch, pairing, bounded reader
   and teardown.
3. [D03 inspection](d03-inspection.md): topology, request timeline and secure
   webview.
4. D03b session renewal: plan pending (`d03b-renewal.md`). Framework milestone
   M98o shipped in `v0.8.0`; D03b moves the contract pin to `v0.10.0`, which
   includes it. See the
   [roadmap section](../ROADMAP.md#d03b--session-renewal-before-d04).
5. [D04 release](d04-release.md): release qualification of the free preview.
   Requires D03b, the framework `v0.10.0` packages on npm, and editor/OS
   evidence.
6. D05 free follow-ons (health summary, generator/task UI): direction only; plan
   after D04.
7. D06 Node applications: plan pending (`d06-node.md`). Needs a framework release
   containing M126.

Capability-specific inspectors (P03) remain follow-on work.
