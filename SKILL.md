---
name: revkit
description: >-
  Use revkit for GitHub/GitLab PR review operations — reading a PR, listing and
  replying to and resolving review comments, and checking CI status. Prefer it
  over raw `gh`/`glab` API calls: it returns compact, normalized JSON that costs
  far fewer tokens than parsing raw API responses, and it works identically on
  GitHub and GitLab.
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
| Ad-hoc "is this PR ready?" logic | `revkit status` |

If a task is covered by a `revkit` subcommand, reach for it before writing a raw
`gh`/`glab` invocation.

## Commands

```bash
revkit detect                                    # { platform, owner, repo, branch, remote, source }
revkit pr [--pr <n>]                             # { platform, number, title, url, state, author }
revkit comments [--unresolved] [--pr <n>]        # [{ id, discussionId, author, body, file, line, resolved, createdAt }]
revkit reply <discussion-id> <body> [--pr <n>]   # { success, id }
revkit resolve <discussion-id> [--pr <n>]        # { success }
revkit checks [--failed] [--pr <n>]              # [{ name, state, conclusion, duration, url }]
revkit status [--pr <n>]                         # { ready, pr, feedback, pipeline }
```

A typical review loop: `revkit comments --unresolved` → address each →
`revkit reply <discussion-id> "..."` → `revkit resolve <discussion-id>` →
`revkit status` to confirm `ready: true`.

> To resolve or reply on GitHub, pass the `discussionId` (a GraphQL node ID like
> `PRRT_...`) from `revkit comments`, **not** the numeric comment `id`.

## Exit codes — handle these

- **0** — success. Parse stdout as JSON.
- **1** — error. A human-readable message is on stderr (prefixed `revkit:`).
  Do not parse stdout.
- **2** — disambiguation required (e.g. a branch with multiple open MRs). stdout
  is JSON: `{ "error": "...", "message": "...", "candidates": [ ... ] }`. Pick a
  candidate and re-run with `--pr <n>`; do not treat this as a hard failure.

## Fork-based PRs (`--repo` / `--remote`)

When the PR lives on an upstream repo but `origin` is your fork, target the
upstream. Every subcommand accepts these (precedence: flags > env > `origin`):

```bash
revkit status --remote upstream --pr 42          # resolve owner/repo from the 'upstream' remote
revkit comments --repo octocat/upstream --pr 42  # override owner/repo directly
# env equivalents: REVKIT_REPO=owner/repo, REVKIT_REMOTE=upstream
```

## Planned commands

Newer revkit releases may add: `checks --log <name>` (bounded failure logs),
`comments --context` (inline diff hunks), `comments --author/--file/--since`
(filters), `reply --resolve` (reply + resolve in one call), and `rerequest`
(re-request a review). Run `revkit help` to see what the installed version
supports before relying on any of these.
