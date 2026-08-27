# Targeting a non-origin repository

By default `revkit` resolves the target repository from the `origin` git
remote. For fork-based PRs, where the PR lives on the upstream repo but
`origin` points at your fork, override the target. These flags work on
**every** subcommand, with this precedence (highest first):

1. CLI flags `--repo <owner/repo>` and/or `--remote <name>`
2. Env vars `REVKIT_REPO` (owner/repo) and `REVKIT_REMOTE`
3. Default: `origin`

```bash
revkit status --remote upstream --pr 42
```

That resolves owner/repo from the `upstream` remote's URL and checks
readiness for PR #42 there.

```bash
revkit comments --unresolved --repo octocat/upstream-repo --pr 42
```

That overrides owner/repo directly, no remote lookup involved.

```bash
REVKIT_REMOTE=upstream revkit status
```

Same as the first example, via environment instead of a flag. Useful for
CI jobs that always operate against the same upstream.

## How resolution works

- `--remote <name>` parses owner/repo from that remote's URL (SSH or HTTPS).
- `--repo owner/repo` overrides parsing entirely, while platform/host still
  derive from the remote.
- `revkit detect` reflects the resolved target and its `source`
  (`flag`/`env`/`default`). See [Output contract](output-schema.md).
- With no flags or env set, behaviour is identical to targeting `origin`
  directly.

## See also

- [Review workflow](review-workflow.md): `revkit detect` and `revkit pr`,
  the two commands most affected by targeting
