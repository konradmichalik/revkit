# revkit

[![Test](https://github.com/konradmichalik/revkit/actions/workflows/test.yml/badge.svg)](https://github.com/konradmichalik/revkit/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/%40konradmichalik%2Frevkit.svg)](https://www.npmjs.com/package/@konradmichalik/revkit)
[![License](https://img.shields.io/github/license/konradmichalik/revkit)](LICENSE)

AI coding assistants reviewing a PR spend tokens on every invocation figuring
out platform-specific API routes, paginating raw responses, and branching
between GitHub's GraphQL and GitLab's REST shapes. `revkit` moves that logic
into a deterministic CLI: one command in, small normalized JSON out, identical
on GitHub and GitLab.

## ✨ Features

- **Platform-agnostic**: GitHub and GitLab return identical normalized JSON shapes
- **[Structured output contract](docs/output-schema.md)**: every response carries a `schemaVersion`, JSON always on stdout, human-readable errors on stderr
- **[Full review-thread context](docs/comments.md)**: filter by author/file/date, pull the diff hunk a comment is anchored to, or walk an entire reply chain
- **[Bounded, cleaned CI logs](docs/checks.md)**: a failed job's log capped and stripped of ANSI, so an agent never falls back to unbounded `gh run view --log`
- **[The review loop in one CLI](docs/review-workflow.md)**: find the PR, reply to and resolve threads, re-request reviewers, confirm readiness
- **[Fork-aware targeting](docs/targeting.md)**: every subcommand can resolve a non-origin repository, for PRs that live upstream
- **[Ships as an agent skill](docs/agent-integration.md)**: a `SKILL.md` included in the npm package teaches an agent when to reach for revkit instead of raw API calls

## 🔥 Installation

```bash
npm install -g @konradmichalik/revkit
```

> [!IMPORTANT]
> Requires [`gh`](https://cli.github.com/) (GitHub) or [`glab`](https://gitlab.com/gitlab-org/cli) (GitLab), installed and authenticated. Node >= 20.

## 🚀 Quick start

```bash
revkit comments --unresolved
```

That prints every unresolved review thread on the PR for your current branch,
as JSON. Platform, PR and repository are all auto-detected from the git
remote.

## ⚡ Usage

`revkit` auto-detects the platform from your git remote and finds the PR/MR
for the current branch automatically. Every command accepts `--repo`/`--remote`
to target a different repository, and `--pr <n>` to target a specific PR
instead of the current branch's.

| Command | Result |
|---------|--------|
| `revkit detect` | `{ platform, owner, repo, branch, remote, source, host }` |
| `revkit whoami` | `{ user, platform }` — the authenticated account name |
| `revkit pr [--pr <n>]` | Find the PR/MR for the current branch |
| `revkit comments [options]` | List review comments (filters, diff context, reply chains): [docs/comments.md](docs/comments.md) |
| `revkit reply <discussion-id> <body> [--resolve]` | Reply to a thread, optionally resolving it in the same call |
| `revkit resolve <discussion-id>` | Resolve a review thread |
| `revkit checks [--failed]` / `checks --log <name>` | List CI/CD checks, or fetch a failing job's bounded log: [docs/checks.md](docs/checks.md) |
| `revkit rerequest --reviewer <name>` | Re-request a review (GitHub) |
| `revkit status` | Check review feedback + pipeline readiness |
| `revkit help` | Show the full command reference |

A typical loop: `revkit comments --unresolved` → address each →
`revkit reply <id> "…" --resolve` → `revkit status` to confirm `ready: true`.

## 📚 Documentation

| Topic | What's inside |
|-------|---------------|
| [Review comments](docs/comments.md) | Filtering by author/file/date, diff context, full reply chains |
| [CI checks](docs/checks.md) | Listing check runs and fetching a failing job's bounded log |
| [Review workflow](docs/review-workflow.md) | `detect`, `pr`, `reply`/`resolve`, `rerequest`, `status` |
| [Output contract](docs/output-schema.md) | `schemaVersion`, the list envelope, exit codes, versioning policy |
| [Targeting a fork](docs/targeting.md) | `--repo`/`--remote` for PRs that live on an upstream repo |
| [Agent integration](docs/agent-integration.md) | Wiring the bundled `SKILL.md` into Claude Code or another agent |

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⭐ License

This project is licensed under [MIT](LICENSE).
