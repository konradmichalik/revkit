# Output contract

Every `revkit` response is JSON on stdout, and the top level is **always an
object**, even for commands that return a list.

- **Object commands** carry `schemaVersion` alongside their fields, e.g.
  `revkit pr` → `{ "schemaVersion": 1, "platform": "github", "number": 42, ... }`.
- **List commands** are wrapped in an envelope, the array lives under `items`:
  `revkit comments` → `{ "schemaVersion": 1, "items": [ ... ] }`.

Read list results from `.items`, never from the top level.

## Payload per command

The table below shows the *payload*, the fields alongside `schemaVersion`
(object commands) or the shape of each `items` entry (list commands). Full
detail, including flags, lives on each command's own page.

| Command | Payload |
|---------|--------|
| [`detect`](review-workflow.md#revkit-detect) | `{ platform, owner, repo, branch, remote, source, host }` |
| [`whoami`](review-workflow.md#revkit-whoami) | `{ user, platform }` |
| [`pr`](review-workflow.md#revkit-pr) | `{ platform, number, title, url, state, author }` |
| [`comments`](comments.md) | `items: [{ id, discussionId, author, body, file, line, resolved, createdAt }]`; with `--with-replies`, adds `replies: [{ id, author, body, createdAt }]` |
| [`reply`](comments.md#replying-and-resolving) | `{ success, id }`; with `--resolve`, `{ success, id, resolved }` |
| [`resolve`](comments.md#replying-and-resolving) | `{ success }` |
| [`checks`](checks.md) | `items: [{ name, state, conclusion, duration, url }]` |
| [`checks --log`](checks.md#--log-name) | `{ name, conclusion, url, log: { lines, truncated, totalLines } }` |
| [`rerequest`](review-workflow.md#revkit-rerequest) | `{ success, reviewers: [<login>] }` |
| [`status`](review-workflow.md#revkit-status) | `{ ready, pr, feedback: { total, resolved, unresolved }, pipeline: { state, url } }` |

## Versioning policy

`schemaVersion` starts at `1`. It is bumped on any **breaking** shape change:
a renamed or removed field, or restructured output. Purely **additive**
fields (a new optional key) do not bump it. Consumers should read
`schemaVersion` and reject a version they do not understand.

## Exit codes

- **0**: success. Parse stdout as JSON (top level is always an object with
  `schemaVersion`).
- **1**: error. A human-readable message is on stderr, prefixed `revkit:`.
  Do not parse stdout.
- **2**: disambiguation required. A branch with multiple open PRs/MRs, or an
  ambiguous `checks --log` name. stdout is JSON:

  ```json
  { "schemaVersion": 1, "error": "multiple_merge_requests", "message": "...", "candidates": [ ... ] }
  ```

  Pick a candidate and re-run with `--pr <n>` (or the exact check name); do
  not treat this as a hard failure.

## See also

- [Review comments](comments.md): the largest payload, and its two opt-in
  fields
- [Targeting a fork](targeting.md): how `--repo`/`--remote` affect `detect`'s
  `source` field
