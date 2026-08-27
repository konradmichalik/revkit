# revkit

CLI that abstracts GitHub/GitLab review operations into structured JSON — designed to reduce token consumption in AI coding assistants by replacing inline platform API logic with deterministic CLI calls.

## 🔥 Installation

```bash
npm install -g @konradmichalik/revkit
```

> [!IMPORTANT]
> Requires [`gh`](https://cli.github.com/) (GitHub) or [`glab`](https://gitlab.com/gitlab-org/cli) (GitLab) to be installed and authenticated. Node >= 20.

## 💡 Usage

revkit auto-detects the platform from your git remote. All output is JSON on stdout (every response carries a top-level `schemaVersion`); errors go to stderr with exit code 1. Exit code 2 signals disambiguation (multiple MRs for a branch, or an ambiguous `checks --log` name) — stdout contains candidates as JSON.

```bash
revkit detect                              # Detect platform, owner, repo, branch
revkit pr [--pr <n>]                       # Find PR/MR for current branch
revkit comments [--unresolved] [--context] [--with-replies] [--author <name>] [--file <path>] [--since <iso>] [--pr <n>]  # List review comments
revkit reply <discussion-id> <body> [--resolve] [--pr <n>]  # Reply (--resolve: resolve in the same call)
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

Every output carries a top-level integer `schemaVersion`. **Array results are wrapped in an envelope** so the top level is always an object: `{ schemaVersion, items: [...] }`. The tables below show the *payload* — the fields alongside `schemaVersion` (object commands) or the shape of each `items` entry (array commands).

| Command | Payload |
|---------|--------|
| `detect` | `{ platform, owner, repo, branch, remote, source }` |
| `pr` | `{ platform, number, title, url, state, author }` |
| `comments` | `items: [{ id, discussionId, author, body, file, line, resolved, createdAt }]` — with `--with-replies`: adds `replies: [{ id, author, body, createdAt }]` |
| `reply` | `{ success, id }` — with `--resolve`: `{ success, id, resolved }` |
| `resolve` | `{ success }` |
| `checks` | `items: [{ name, state, conclusion, duration, url }]` |
| `rerequest` | `{ success, reviewers: [<login>] }` |
| `status` | `{ ready, pr, feedback: { total, resolved, unresolved }, pipeline: { state, url } }` |

For example, `revkit comments` returns `{ "schemaVersion": 1, "items": [ … ] }` and `revkit pr` returns `{ "schemaVersion": 1, "platform": "github", … }`. The exit-code-2 disambiguation envelope carries `schemaVersion` too.

#### Versioning policy

`schemaVersion` starts at `1`. It is bumped on any **breaking** shape change (renamed/removed field, restructured output); purely **additive** fields (a new optional key) do not bump it. Consumers should read `schemaVersion` and reject versions they do not understand.

> [!NOTE]
> On GitHub, `resolve` uses the GraphQL API (`resolveReviewThread`). The `discussionId` must be a GraphQL node ID (format `PRRT_...`) as returned by `revkit comments`.

> [!NOTE]
> `reply --resolve` replies first, then resolves. If the reply fails, nothing is mutated (exit 1). If the reply succeeds but the resolve fails, the command still exits 0 with `resolved: false` and a warning on stderr — retry `resolve <discussion-id>` alone rather than the whole command, which would post a duplicate reply.

#### Comment filters

`revkit comments` accepts filters that narrow the payload before it reaches the caller — useful on active PRs where human and bot threads are mixed:

| Flag | Meaning |
|------|---------|
| `--unresolved` | Only threads that are not resolved |
| `--author <name>` | Only this author. **Repeatable** (OR within the flag). Matches bots regardless of `[bot]` suffix or case, so `--author coderabbitai` and `--author coderabbitai[bot]` are equivalent. Matches the thread **opener** only — not participants in `replies` (see `--with-replies`). |
| `--file <path>` | Exact match against the `file` field (no globbing in v1) |
| `--since <iso>` | Threads whose `createdAt` is on or after this date (ISO 8601 or `YYYY-MM-DD`). Compares thread **creation**, not update time — answers "what's new since my last push". |

Filters are AND-combined and composable with `--unresolved`. An empty result is `[]` with exit code 0 (not an error). An unparseable `--since` exits 1 with a `revkit:` message.

```bash
revkit comments --unresolved --author coderabbitai --since 2026-07-20   # unresolved CodeRabbit threads since a date
revkit comments --file src/index.js --author alice --author bob         # alice or bob, only on one file
```

#### Inline diff context (`--context`)

`revkit comments --context` adds a `diffHunk` field per comment — the unified-diff hunk the comment is anchored to — so an agent understands what a reviewer means without a separate file/diff read. Off by default (zero overhead unless requested).

- **GitHub** — sourced from the GraphQL `diffHunk` field, no extra API calls.
- **GitLab** — the MR diff is fetched once and the anchoring hunk sliced out per comment (correct for old- and new-side positions).
- Comments on deleted/renamed files or outdated positions degrade gracefully to `diffHunk: null`.

#### Full thread chain (`--with-replies`)

`revkit comments --with-replies` adds a `replies` array per comment — every follow-up in the thread, chronological, excluding the opener (already at the top level). Off by default, so existing output and its token cost stay unchanged unless requested.

```json
{
  "id": "...", "discussionId": "...", "author": "coderabbitai", "body": "...",
  "replies": [
    { "id": "...", "author": "konradmichalik", "body": "...", "createdAt": "..." },
    { "id": "...", "author": "coderabbitai",   "body": "...", "createdAt": "..." }
  ]
}
```

- **GitHub** — sourced from the same GraphQL request (`comments(first: 100)`), no extra API calls.
- **GitLab** — sourced from the existing `discussions` response; system notes (e.g. "resolved this thread") are excluded.
- A thread without replies returns `replies: []`, never a missing key.
- Threads with more than 100 comments are truncated to the first 100 — an edge case rare enough in practice that it is documented here rather than handled with nested pagination.
- Checking whether the *last* comment is yours is not enough to tell if a thread is settled: bots often post an acknowledgement after a human reply (e.g. `reviewer → you: "fixed" → bot: "thanks for confirming"`). Walk the full `replies` chain instead of only the last entry.

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
├── args.js           # CLI arg parsing (parseFlag, parseFlagAll, parseTarget, positional)
├── exec.js           # child_process wrapper (execText, execJSON, execFileText)
├── output.js         # json() → schemaVersion envelope on stdout, error()/warn() → stderr
├── target.js         # resolve + validate target repo from flag/env/remote
├── platform.js       # detect GitHub/GitLab from resolved target host
├── pr.js             # find PR/MR for current branch
├── comments.js       # list, filter (--context/--with-replies/--author/--file/--since), reply, resolve
├── status.js         # feedback + pipeline readiness check
├── checks.js         # CI/CD check runs per job + bounded failure logs (--log)
└── rerequest.js      # re-request a PR review (GitHub)
test/                 # one *.test.js per src module (node:test), plus skill.test.js
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
