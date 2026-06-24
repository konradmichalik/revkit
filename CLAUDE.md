# CLAUDE.md

## Project Overview

revkit is a Node.js CLI tool that abstracts Git platform operations (GitHub/GitLab) into structured JSON output. It exists to reduce token consumption in Claude Code commands (`k:review`, `k:pr`, `k:comment`) by replacing inline API logic with simple CLI calls.

## Motivation

Claude Code commands like `k:review` currently spend tokens figuring out platform-specific API routes, parsing JSON, handling errors, and distinguishing GitHub from GitLab — every single invocation. revkit moves this logic into a deterministic CLI, so commands only need to call `revkit comments --unresolved` and focus on the intelligent parts (evaluation, user interaction).

## Architecture

```
bin/revkit.js         # CLI entry point, argument routing
src/
├── exec.js           # child_process wrapper (execText, execJSON, execFileText)
├── args.js           # CLI arg parsing (parseFlag, parseTarget, positional)
├── output.js         # json() → stdout, error() → stderr + exit 1
├── target.js         # resolve target repo (flag/env/default), parse + validate remote URLs
├── platform.js       # detect GitHub/GitLab from resolved target host
├── pr.js             # find PR/MR for current branch
├── comments.js       # list, filter, reply, resolve comments
├── status.js         # feedback + pipeline readiness check
└── checks.js         # CI/CD check runs per job
test/
├── args.test.js
├── checks.test.js
├── exec.test.js
├── platform.test.js
├── pr.test.js
├── target.test.js
└── output.test.js
```

## CLI Interface

All subcommands accept `--repo <owner/repo>` and `--remote <name>` to target a
non-origin repository (e.g. fork PRs). Resolution precedence: flags >
`REVKIT_REPO`/`REVKIT_REMOTE` env vars > `origin` default (see `src/target.js`).

```bash
revkit detect                       # → { platform, owner, repo, branch, remote, source }
revkit pr [--pr <n>]            # → { number, title, url, state, author }
revkit comments [--unresolved]      # → [{ id, discussionId, author, body, file, line, resolved, createdAt }]
revkit reply <discussion-id> <body> [--pr <n>]  # → { success, id }
revkit resolve <discussion-id> [--pr <n>]      # → { success }
revkit checks [--failed] [--pr <n>]  # → [{ name, state, conclusion, duration, url }]
revkit status [--pr <n>]            # → { ready, pr, feedback, pipeline }
```

## Exit Codes

- `0` — success, parse stdout as JSON
- `1` — generic error, message on stderr
- `2` — disambiguation required (multiple MRs for same branch), parse stdout as JSON:
  `{ "error": "multiple_merge_requests", "message": "...", "candidates": [{ number, title, target, draft, author, url }] }`

## Design Decisions

- **Wraps `gh`/`glab` CLIs** — uses REST + GraphQL via CLI, no auth management. Both CLIs handle authentication and pagination.
- **Zero external dependencies** — pure Node.js with `node:child_process`, `node:test`, `node:assert`.
- **ESM modules** — `"type": "module"` in package.json.
- **Structured JSON on stdout** — machine-readable output for Claude Code commands.
- **Human-readable errors on stderr** — with `revkit:` prefix and exit code 1.
- **Platform-agnostic output** — GitHub and GitLab return the same normalized data shapes.

## Development

```bash
node --test test/**/*.test.js       # run all tests
node bin/revkit.js detect           # smoke test
npm link                            # make revkit available globally
```

## Consuming Commands

These Claude Code commands in `claude-code-commands` are intended consumers:

| Command | Uses |
|---------|------|
| `k:review` | `detect`, `comments --unresolved`, `reply`, `resolve` |
| `k:pr` | `detect`, `pr` |
| `k:comment` | `detect`, `pr` |

## Next Steps

- [ ] `npm link` for global availability
- [ ] Rewrite `k:review` to use `revkit` CLI calls
- [ ] Rewrite `k:pr` and `k:comment` to use `revkit detect` and `revkit pr`
- [ ] GitLab integration testing (currently only GitHub tested live)
