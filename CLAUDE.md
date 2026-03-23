# CLAUDE.md

## Project Overview

revkit is a Node.js CLI tool that abstracts Git platform operations (GitHub/GitLab) into structured JSON output. It exists to reduce token consumption in Claude Code commands (`k:review`, `k:pr`, `k:comment`) by replacing inline API logic with simple CLI calls.

## Motivation

Claude Code commands like `k:review` currently spend tokens figuring out platform-specific API routes, parsing JSON, handling errors, and distinguishing GitHub from GitLab — every single invocation. revkit moves this logic into a deterministic CLI, so commands only need to call `revkit comments --unresolved` and focus on the intelligent parts (evaluation, user interaction).

## Architecture

```
bin/revkit.js         # CLI entry point, argument routing
src/
├── exec.js           # child_process wrapper (execText, execJSON)
├── output.js         # json() → stdout, error() → stderr + exit 1
├── platform.js       # detect GitHub/GitLab from git remote
├── pr.js             # find PR/MR for current branch
├── comments.js       # list, filter, reply, resolve comments
├── status.js         # feedback + pipeline readiness check
└── checks.js         # CI/CD check runs per job
test/
├── exec.test.js
├── platform.test.js
└── output.test.js
```

## CLI Interface

```bash
revkit detect                       # → { platform, owner, repo, branch }
revkit pr [--pr <n>]            # → { number, title, url, state, author }
revkit comments [--unresolved]      # → [{ id, discussionId, author, body, file, line, resolved, createdAt }]
revkit reply <comment-id> <body>    # → { success, id }
revkit resolve <discussion-id>      # → { success }
revkit checks [--pr <n>]            # → [{ name, state, url }]
revkit status [--pr <n>]            # → { ready, pr, feedback, pipeline }
```

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
