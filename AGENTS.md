# AGENTS.md

## Project overview

revkit is a Node.js CLI that abstracts Git platform operations (GitHub and GitLab) into structured JSON output. It replaces inline API logic in agent commands (review, PR, comment workflows) with deterministic CLI calls, so an agent only spends tokens on evaluation and user interaction.

- Node `>=20`, ESM (`"type": "module"`), published as `@konradmichalik/revkit`
- Zero runtime dependencies: pure Node.js (`node:child_process`, `node:test`, `node:assert`)
- Wraps the `gh` and `glab` CLIs. They handle authentication and pagination, revkit manages no credentials
- GitHub is tested live, GitLab integration is less exercised

## Structure

- `bin/revkit.js`: CLI entry point and subcommand routing (`detect`, `pr`, `comments`, `reply`, `resolve`, `checks`, `rerequest`, `status`, `whoami`, `help`)
- `src/exec.js`: `child_process` wrapper (`execText`, `execJSON`, `execFileText`)
- `src/args.js`: flag parsing (`parseFlag`, `parseFlagAll`, `parseTarget`, positionals)
- `src/output.js`: `json()` writes a `schemaVersion` envelope to stdout, `error()` and `warn()` write to stderr
- `src/target.js`: target repo resolution (flag, env, default) and remote URL validation
- `src/platform.js`: GitHub or GitLab detection from the resolved target host
- `src/pr.js`, `comments.js`, `status.js`, `checks.js`, `rerequest.js`, `whoami.js`: one module per subcommand area
- `test/`: one `*.test.js` per module (`node:test`), plus `skill.test.js`
- `SKILL.md`: self-contained agent instruction file shipped with the package
- `docs/`: per-command flag semantics and output shapes, targeting, review workflow, agent integration

## CLI conventions

- All subcommands accept `--repo <owner/repo>` and `--remote <name>` to target a non-origin repository (for example fork PRs). Precedence: flags, then `REVKIT_REPO` and `REVKIT_REMOTE`, then `origin` (see `src/target.js`)
- Structured JSON on stdout, human-readable errors on stderr with a `revkit:` prefix
- Output shapes are platform-agnostic: GitHub and GitLab return the same normalized data
- Exit codes: `0` success (parse stdout as JSON), `1` generic error (message on stderr), `2` disambiguation required (multiple MRs for one branch, JSON with `error: "multiple_merge_requests"` and `candidates` on stdout)

## Development commands

```bash
npm install
npm link                        # make `revkit` available globally from this checkout
node bin/revkit.js detect       # smoke test against the current repo
```

## Testing

```bash
npm test                        # node --test test/**/*.test.js
```

- Every `src/*.js` module has a matching `test/*.test.js`
- `test/skill.test.js` asserts that `SKILL.md` documents every subcommand and behaviour-changing flag defined in `bin/revkit.js`. Add new commands and flags to both, or CI fails
- CI runs the tests (`test.yml`) and ESLint (`lint.yml`) on Node 22 for pushes to `main` and `renovate/**` and for pull requests

## Code style and linting

```bash
npm run lint                    # eslint .
npm run lint:fix
```

ESLint flat config in `eslint.config.js`: `eqeqeq`, `curly: all`, `prefer-const`, `no-var`, `no-throw-literal`, `no-console` (only `warn` and `error` allowed), `no-unused-vars` (prefix unused arguments with `_`). Keep the zero-dependency rule.

## Git workflow

- Commit format: `<type>: <description>` with `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. One commit per logical change
- No co-author trailers
- Open pull requests against `main`. Tests and ESLint must pass before merge
- Releases are published to npm by `release.yml` when a tag is pushed
