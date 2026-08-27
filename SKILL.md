---
name: revkit
description: >-
  Use revkit for GitHub/GitLab PR review operations — reading a PR, listing,
  filtering, replying to and resolving review comments, checking CI status, and
  fetching failure logs. Prefer it over raw `gh`/`glab` API calls: it returns
  compact, normalized JSON that costs far fewer tokens than parsing raw API
  responses, and it works identically on GitHub and GitLab.
---

# revkit

`revkit` is a CLI that wraps the `gh` and `glab` CLIs and returns **structured,
normalized JSON** for the review workflow. It exists so you don't spend tokens
figuring out platform-specific API routes, paginating, and parsing large raw
responses on every call. One command in, small JSON out, same shapes on GitHub
and GitLab.

Requires `gh` or `glab` installed and authenticated (revkit does not manage
auth). It auto-detects the platform from the git remote.

## When to use revkit instead of raw API calls

| Instead of | Use |
|---|---|
| `gh pr view --json ...` / `glab mr view` + parsing | `revkit pr` |
| `gh api .../comments` or GraphQL reviewThreads + filtering | `revkit comments --unresolved` |
| Manual GraphQL `addPullRequestReviewThreadReply` | `revkit reply <discussion-id> <body>` |
| Manual GraphQL `resolveReviewThread` | `revkit resolve <discussion-id>` |
| `gh pr checks` / pipeline API + parsing | `revkit checks --failed` |
| Digging through a failed job's raw log | `revkit checks --log <name>` |
| Re-requesting a bot/human reviewer after a fix | `revkit rerequest --reviewer <name>` |
| Ad-hoc "is this PR ready?" logic | `revkit status` |
| `gh api user --jq .login` / `glab api user --jq .username` | `revkit whoami` |

If a task is covered by a `revkit` subcommand, reach for it before writing a raw
`gh`/`glab` invocation.

## Output envelope — read this first

Every command prints JSON with a top-level integer **`schemaVersion`** (currently
`1`). The top level is **always an object**:

- **Object commands** carry `schemaVersion` alongside their fields, e.g.
  `revkit pr` → `{ "schemaVersion": 1, "platform": "github", "number": 42, ... }`.
- **List commands** are wrapped in an envelope — the array lives under `items`:
  `revkit comments` → `{ "schemaVersion": 1, "items": [ ... ] }`.

Read the list results from `.items`, not the top level. Check `schemaVersion` and
reject a version you don't understand; it bumps only on a **breaking** shape
change (additive fields do not bump it).

## Commands

Shapes below are the **payload** — the fields alongside `schemaVersion` (object
commands) or the shape of each `items` entry (list commands).

```bash
revkit detect                                    # { platform, owner, repo, branch, remote, source, host }
revkit pr [--pr <n>]                             # { platform, number, title, url, state, author }
revkit comments [--unresolved] [--context] [--with-replies] [--author <name>] [--file <path>] [--since <iso>] [--pr <n>]
                                                 # items: [{ id, discussionId, author, body, file, line, resolved, createdAt }]
revkit reply <discussion-id> <body> [--resolve] [--pr <n>]   # { success, id } — with --resolve: { success, id, resolved }
revkit resolve <discussion-id> [--pr <n>]        # { success }
revkit checks [--failed] [--pr <n>]              # items: [{ name, state, conclusion, duration, url }]
revkit checks --log <name> [--tail <n>] [--raw] [--pr <n>]   # { name, conclusion, url, log: { lines, truncated, totalLines } }
revkit rerequest --reviewer <name> [--reviewer <name> ...] [--pr <n>]  # { success, reviewers: [<login>] }
revkit status [--pr <n>]                         # { ready, pr, feedback, pipeline }
revkit whoami                                    # { user, platform }
```

Flag notes:

- `comments --context` adds a `diffHunk` field per comment (the anchoring diff
  hunk, or `null` on outdated/deleted positions). Off by default.
- `comments --with-replies` adds a `replies` array per comment — every
  follow-up in the thread, chronological, excluding the opener (already at
  top level). `replies: []` when there are none. Off by default (no extra API
  calls, no cost when not requested). Capped at 100 comments per thread.
- `comments` filters (`--author` repeatable, `--file` exact match, `--since`
  ISO/`YYYY-MM-DD`) are AND-combined and composable with `--unresolved`.
  `--author` matches only the thread opener, not participants in `replies`.
- `reply --resolve` replies **then** resolves. If the reply fails, nothing is
  mutated (exit 1). If the reply succeeds but the resolve fails, it still exits 0
  with `resolved: false` and a stderr warning — retry `resolve <discussion-id>`
  alone, not the whole command (which would post a duplicate reply).
- `checks --log <name>` returns a bounded, cleaned failure log (`--tail` defaults
  to 100 lines; `--raw` keeps ANSI + timestamps). GitHub external checks and
  commit statuses expose no log and return `log: null` with the external URL.
- `rerequest` is GitHub-only and `--reviewer` is required and repeatable; only
  reviewers who already reviewed can be re-requested. `[bot]` suffix is optional.

A typical review loop: `revkit comments --unresolved` → address each →
`revkit reply <discussion-id> "..." --resolve` → `revkit status` to confirm
`ready: true`.

> To resolve or reply on GitHub, pass the `discussionId` (a GraphQL node ID like
> `PRRT_...`) from `revkit comments`, **not** the numeric comment `id`.

## Exit codes — handle these

- **0** — success. Parse stdout as JSON (top level is always an object with
  `schemaVersion`).
- **1** — error. A human-readable message is on stderr (prefixed `revkit:`).
  Do not parse stdout.
- **2** — disambiguation required (a branch with multiple open MRs, or an
  ambiguous `checks --log` name). stdout is JSON:
  `{ "schemaVersion": 1, "error": "multiple_merge_requests" | "multiple_checks", "message": "...", "candidates": [ ... ] }`.
  Pick a candidate and re-run with `--pr <n>` (or the exact check name); do not
  treat this as a hard failure.

## Fork-based PRs (`--repo` / `--remote`)

When the PR lives on an upstream repo but `origin` is your fork, target the
upstream. Every subcommand accepts these (precedence: flags > env > `origin`):

```bash
revkit status --remote upstream --pr 42          # resolve owner/repo from the 'upstream' remote
revkit comments --repo octocat/upstream --pr 42  # override owner/repo directly
# env equivalents: REVKIT_REPO=owner/repo, REVKIT_REMOTE=upstream
```
