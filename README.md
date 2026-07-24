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

### Targeting a non-origin repository

By default revkit resolves the target from the `origin` remote. For fork-based PRs — where the PR lives on the upstream repo but `origin` points to your fork — override the target. These flags work on **every** subcommand, with this precedence (highest first):

1. CLI flags `--repo <owner/repo>` and/or `--remote <name>`
2. Env vars `REVKIT_REPO` (owner/repo) and `REVKIT_REMOTE`
3. Default: `origin`

```bash
revkit status --remote upstream --pr 42              # resolve owner/repo from the 'upstream' remote URL
revkit comments --unresolved --repo octocat/repo --pr 42  # override owner/repo directly
REVKIT_REMOTE=upstream revkit status                 # same via environment
```

`--remote <name>` parses owner/repo from that remote's URL (SSH or HTTPS). `--repo owner/repo` overrides parsing entirely while platform/host still derive from the remote. `revkit detect` reflects the resolved target and its `source` (`flag`/`env`/`default`). With no flags or env set, behaviour is identical to before.

### Output shapes

| Command | Output |
|---------|--------|
| `detect` | `{ platform, owner, repo, branch, remote, source }` |
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

## 🤖 Using revkit from an AI agent

revkit ships a [`SKILL.md`](./SKILL.md) — a self-contained instruction file that
tells an agent what revkit is, when to prefer it over raw `gh`/`glab` calls (an
antipattern → command table), how to read the exit codes, and how to target
fork-based PRs. It is included in the npm package.

Wire it into your agent setup by pointing the agent at the installed file:

```bash
# Find it inside the installed package
node -e "console.log(require.resolve('@konradmichalik/revkit/SKILL.md'))"

# Claude Code: copy it into a skill directory
mkdir -p .claude/skills/revkit
cp "$(npm root -g)/@konradmichalik/revkit/SKILL.md" .claude/skills/revkit/SKILL.md
```

For other assistants, include `SKILL.md`'s contents in the system prompt or
tool/skill configuration. A test (`test/skill.test.js`) keeps `SKILL.md` in sync
with the command surface, so it will not drift silently from the CLI.

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
