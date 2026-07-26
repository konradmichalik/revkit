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
revkit checks --log <name> [--tail <n>] [--raw] [--pr <n>]  # Fetch a check's log (bounded)
revkit rerequest --reviewer <name> [--reviewer <name> ...] [--pr <n>]  # Re-request review (GitHub)
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
| `rerequest` | `{ success, reviewers: [<login>] }` |
| `status` | `{ ready, pr, feedback: { total, resolved, unresolved }, pipeline: { state, url } }` |

> [!NOTE]
> On GitHub, `resolve` uses the GraphQL API (`resolveReviewThread`). The `discussionId` must be a GraphQL node ID (format `PRRT_...`) as returned by `revkit comments`.

#### Fetching a check's log (`checks --log`)

`checks --failed` says *that* a job failed; `checks --log <name>` says *why*, with bounded, machine-readable output so an agent never falls back to unbounded `gh run view --log`.

```bash
revkit checks --log "Test Suite"            # last 100 lines, cleaned
revkit checks --log "Test Suite" --tail 40  # last 40 lines
revkit checks --log "Test Suite" --raw      # keep ANSI + timestamps
```

Output: `{ name, conclusion, url, log: { lines: [], truncated, totalLines } }`.

- **GitHub** — Actions-backed check runs fetch the workflow job log via `actions/jobs/{id}/logs`. External checks (Travis, Jenkins, review apps) and commit statuses expose no logs via the API, so they return `log: null` plus the external URL instead of erroring.
- **GitLab** — the failing job's trace from the latest MR pipeline.
- **Log hygiene** — ANSI escapes and GitHub per-line timestamps are stripped by default (pure token waste for an agent); `--raw` opts out. `--tail` defaults to 100; `truncated` signals when lines were cut.
- Ambiguous check names reuse the **exit-code-2** disambiguation pattern (`{ error: "multiple_checks", candidates: [...] }` on stdout).

#### Re-requesting a review (`rerequest`)

Bot reviewers (e.g. CodeRabbit) need an explicit re-request after fixes are pushed. `--reviewer` is required and repeatable — there is no implicit "all reviewers" default, which would spam humans who already approved.

```bash
revkit rerequest --reviewer coderabbitai --reviewer alice
```

- Only reviewers who have **already reviewed** the PR can be re-requested; naming one who never reviewed exits 1 with a `revkit:` message.
- Bots match regardless of `[bot]` suffix — `--reviewer coderabbitai` and `--reviewer coderabbitai[bot]` are equivalent, and the canonical login is sent to GitHub either way.
- GitHub only for now. GitLab has no confirmed re-request endpoint (remove+re-add of `reviewer_ids` is unverified, and `reset_approvals` is the wrong tool), so it exits with a clear message pending [#4](https://github.com/konradmichalik/revkit/issues/4).

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
