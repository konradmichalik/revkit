# revkit

CLI that abstracts GitHub/GitLab review operations into structured JSON — designed to reduce token consumption in AI coding assistants by replacing inline platform API logic with deterministic CLI calls.

## 🔥 Installation

```bash
npm install -g @konradmichalik/revkit
```

> [!IMPORTANT]
> Requires [`gh`](https://cli.github.com/) (GitHub) or [`glab`](https://gitlab.com/gitlab-org/cli) (GitLab) to be installed and authenticated. Node >= 20.

## 💡 Usage

revkit auto-detects the platform from your git remote. All output is JSON on stdout; errors go to stderr with exit code 1. Exit code 2 signals disambiguation (multiple MRs for same branch) — stdout contains candidates as JSON.

```bash
revkit detect                              # Detect platform, owner, repo, branch
revkit pr [--pr <n>]                       # Find PR/MR for current branch
revkit comments [--unresolved] [--pr <n>]  # List review comments
revkit reply <discussion-id> <body> [--pr <n>]  # Reply to a comment
revkit resolve <discussion-id> [--pr <n>]     # Resolve a review thread
revkit checks [--failed] [--pr <n>]        # List CI/CD check runs per job
revkit status [--pr <n>]                   # Check feedback + pipeline readiness
revkit help                                # Show help
```

### Output shapes

| Command | Output |
|---------|--------|
| `detect` | `{ platform, owner, repo, branch }` |
| `pr` | `{ platform, number, title, url, state, author }` |
| `comments` | `[{ id, discussionId, author, body, file, line, resolved, createdAt }]` |
| `reply` | `{ success, id }` |
| `resolve` | `{ success }` |
| `checks` | `[{ name, state, conclusion, duration, url }]` |
| `status` | `{ ready, pr, feedback: { total, resolved, unresolved }, pipeline: { state, url } }` |

> [!NOTE]
> On GitHub, `resolve` uses the GraphQL API (`resolveReviewThread`). The `discussionId` must be a GraphQL node ID (format `PRRT_...`) as returned by `revkit comments`.

## ✨ Features

- **Platform-agnostic** — GitHub and GitLab return identical normalized shapes
- **Zero external dependencies** — pure Node.js (`node:child_process`, `node:test`, `node:assert`)
- **Wraps `gh`/`glab`** — REST + GraphQL where needed, no auth management, pagination handled automatically
- **Machine-readable stdout** — JSON always, so callers can pipe directly
- **Human-readable stderr** — prefixed with `revkit:`, exit code 1 on failure
- **Multi-MR disambiguation** — when a branch has multiple MRs, returns structured candidates (exit code 2) instead of crashing
- **ESM modules** — `"type": "module"` throughout

## ⚙️ Architecture

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
├── checks.test.js
├── exec.test.js
├── platform.test.js
├── pr.test.js
└── output.test.js
```

## 🧑‍💻 Development

```bash
npm test                       # run all tests
node bin/revkit.js detect      # smoke test
```

> [!TIP]
> Run `node bin/revkit.js help` at any time to see the full command reference without leaving the terminal.

## 📜 License

MIT
