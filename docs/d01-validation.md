# D01 validation — 2026-09-27

Scope: local foundation on `feat/d01-foundation`, Linux desktop file workspaces.
No framework package is imported. This is development-host evidence, not VSIX
installation or release qualification.

## Measured environment

| Component                    | Version |
| ---------------------------- | ------- |
| Code - OSS                   | 1.138.0 |
| Embedded extension-host Node | 24.19.0 |
| Electron                     | 42.11.8 |
| Build/test Node              | 24.18.0 |

## Results

- Clean lockfile install, TypeScript check, formatting, eight unit tests and
  production bundle build pass. Dependency installation reports no vulnerabilities.
- Development host: discovers the synthetic workspace member, rejects arbitrary
  selection IDs, accepts a current ID, clears selection on refresh and rejects
  its stale ID. Explicit sample command displays the sample marker; refresh
  returns to discovered projects.
- Production bundle in the actual host: discovery/selection pass and the sample
  command is absent. The build also rejects sample marker/command leakage.
- Restricted host: `workspace.isTrusted` is false; invoking refresh exposes no
  projects or selection and reports the trust refusal. A development extension
  may activate despite its manifest restriction, so runtime guards are essential.
- Unit cases exercise refused host contexts, malformed/duplicate/deep JSON,
  oversized and invalid UTF-8 files, symlink/path escapes, authoritative invalid
  manifests, invalid dependencies/cycles/ports, duplicate roots, minimized
  descriptors, and refresh coalescing/invalidation/disposal.

Run the commands in [README](../README.md) to reproduce. The runner waits for the
isolated editor and requires a passing structured evidence file; process exit
alone is insufficient. Generated evidence and editor logs stay under `.tmp/`.
No user editor profile is changed. CI runs non-GUI checks; host checks are local.

## Security boundaries and remaining evidence

D01 reads only bounded known manifest/config files and stores minimized project
metadata in memory. It does not evaluate tasks/import application code, read
`.env`, launch applications, create network connections or persist diagnostics.
Filesystem symlink rejection is not an isolation guarantee against active
same-user directory replacement races; D02 must revalidate launch inputs.

These checks cover only the D01 portions of S01/S02/S14. Unsupported platforms
are tested through policy inputs, not actual remote/web/Windows/macOS hosts.
Packaged Restricted Mode activation, VS Code-branded hosts, VSIX contents,
framework integration, process cleanup, transport, webview and full stress
qualification remain D02–D04 work. The framework contract register must be
refreshed before D02; its old pinned revision is not a claim about current M98.
