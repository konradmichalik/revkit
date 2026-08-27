# Agent integration

`revkit` ships a [`SKILL.md`](../SKILL.md), a self-contained instruction file
that tells an agent what revkit is, when to prefer it over raw `gh`/`glab`
calls (an antipattern → command table), how to read the exit codes, and how
to target fork-based PRs. It is included in the npm package.

## Wiring it into Claude Code

```bash
mkdir -p .claude/skills/revkit
cp "$(npm root -g)/@konradmichalik/revkit/SKILL.md" .claude/skills/revkit/SKILL.md
```

## Finding the installed file

If the package is installed locally rather than globally, resolve its path
instead of assuming the global root:

```bash
node -e "console.log(require.resolve('@konradmichalik/revkit/SKILL.md'))"
```

## Other assistants

For assistants without a skills mechanism, include `SKILL.md`'s contents in
the system prompt or tool/skill configuration directly. It's plain Markdown,
no Claude-specific syntax.

A test (`test/skill.test.js`) keeps `SKILL.md` in sync with the command
surface: every subcommand and behaviour-changing flag in `bin/revkit.js` must
appear in `SKILL.md`, or the test fails. So it will not drift silently from
the CLI.

## See also

- [Output contract](output-schema.md): the `schemaVersion` contract
  `SKILL.md` teaches an agent to rely on
