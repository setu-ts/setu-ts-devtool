# Setu-TS Devtool — Claude Code

@AGENTS.md

`AGENTS.md` is the canonical workflow and safety policy for every assistant; the
import above loads it into every Claude Code session. Keep repository rules
there, not here.

Project skills live in `.agents/skills/`, which Codex reads directly. Claude
Code reads `.claude/skills/`, which is gitignored, so link it once per clone:

```sh
mkdir -p .claude
ln -s ../.agents/skills .claude/skills
```
