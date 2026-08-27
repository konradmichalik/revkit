# Review comments (`revkit comments`)

```bash
revkit comments [--unresolved] [--context] [--with-replies] [--author <name>] [--file <path>] [--since <iso>] [--pr <n>]
```

Lists review comments for the PR/MR on the current branch as
`{ schemaVersion, items: [{ id, discussionId, author, body, file, line, resolved, createdAt }] }`.
Filters narrow the payload before it reaches the caller; the two flags below add
fields to each entry. Both are off by default so existing output, and its token
cost, stays unchanged unless requested.

## Filters

| Flag | Meaning |
|------|---------|
| `--unresolved` | Only threads that are not resolved |
| `--author <name>` | Only this author. **Repeatable** (OR within the flag). Matches bots regardless of `[bot]` suffix or case, so `--author coderabbitai` and `--author coderabbitai[bot]` are equivalent. Matches the thread **opener** only, not participants in `replies` |
| `--file <path>` | Exact match against the `file` field (no globbing in v1) |
| `--since <iso>` | Threads whose `createdAt` is on or after this date (ISO 8601 or `YYYY-MM-DD`). Compares thread **creation**, not update time |

Filters are AND-combined and composable with `--unresolved`. An empty result is
`[]` with exit code 0, not an error. An unparseable `--since` exits 1 with a
`revkit:` message.

```bash
revkit comments --unresolved --author coderabbitai --since 2026-07-20
```

That's every unresolved CodeRabbit thread opened on or after 20 July 2026.

```bash
revkit comments --file src/index.js --author alice --author bob
```

That's every comment on `src/index.js` opened by alice or bob.

## `--context`

Adds a `diffHunk` field per comment: the unified-diff hunk the comment is
anchored to, so an agent understands what a reviewer means without a separate
file/diff read.

```bash
revkit comments --unresolved --context
```

- **GitHub**: sourced from the GraphQL `diffHunk` field, no extra API calls.
- **GitLab**: the MR diff is fetched once and the anchoring hunk sliced out per
  comment, correct for both old- and new-side positions.
- Comments on deleted/renamed files or outdated positions degrade gracefully to
  `diffHunk: null`.

## `--with-replies`

Adds a `replies` array per comment: every follow-up in the thread,
chronological, excluding the opener (already at the top level).

```bash
revkit comments --unresolved --with-replies
```

```json
{
  "id": "...", "discussionId": "...", "author": "coderabbitai", "body": "...",
  "replies": [
    { "id": "...", "author": "konradmichalik", "body": "...", "createdAt": "..." },
    { "id": "...", "author": "coderabbitai",   "body": "...", "createdAt": "..." }
  ]
}
```

- **GitHub**: sourced from the same GraphQL request (`comments(first: 100)`),
  no extra API calls.
- **GitLab**: sourced from the existing `discussions` response; system notes
  (e.g. "resolved this thread") are excluded.
- A thread without replies returns `replies: []`, never a missing key.
- Threads with more than 100 comments are truncated to the first 100.
- Checking whether the *last* comment is yours is not enough to tell if a
  thread is settled: bots often post an acknowledgement after a human reply
  (e.g. `reviewer → you: "fixed" → bot: "thanks for confirming"`). Walk the
  full `replies` chain instead of only the last entry.

## Replying and resolving

```bash
revkit reply <discussion-id> <body> [--resolve] [--pr <n>]
revkit resolve <discussion-id> [--pr <n>]
```

`reply` returns `{ success, id }`, or `{ success, id, resolved }` with
`--resolve`. `resolve` returns `{ success }`.

```bash
revkit reply PRRT_kwDOA1b2Cc5xYzAB "Fixed in a1b2c3d" --resolve
```

That posts the reply, then resolves the thread in the same call.

> [!NOTE]
> On GitHub, `resolve` uses the GraphQL API (`resolveReviewThread`). The
> `discussionId` must be a GraphQL node ID (format `PRRT_...`) as returned by
> `revkit comments`, not the numeric comment `id`.

> [!NOTE]
> `reply --resolve` replies first, then resolves. If the reply fails, nothing
> is mutated (exit 1). If the reply succeeds but the resolve fails, the command
> still exits 0 with `resolved: false` and a warning on stderr. Retry
> `resolve <discussion-id>` alone rather than the whole command, which would
> post a duplicate reply.

## See also

- [Review workflow](review-workflow.md): where `reply`/`resolve` fit in the
  detect → comments → reply → status loop
- [Output contract](output-schema.md): the `schemaVersion` envelope and exit
  codes shared by every command
