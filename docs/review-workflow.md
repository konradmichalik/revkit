# The review loop: `detect`, `pr`, `status`, `rerequest`

The commands here are the scaffolding around [`comments`](comments.md) and
[`checks`](checks.md): find the PR, act on its feedback, confirm it's ready,
and pull reviewers back in after a fix.

## `revkit detect`

```bash
revkit detect
```

Detects the platform, repository and branch from the git remote, without
looking up a PR. Returns `{ schemaVersion, platform, owner, repo, branch, remote, source }`.
`source` is `flag`, `env` or `default`, reflecting how the target repository
was resolved. See [Targeting a fork](targeting.md).

## `revkit pr`

```bash
revkit pr [--pr <n>]
```

Finds the PR/MR for the current branch. Returns
`{ schemaVersion, platform, number, title, url, state, author }`.

```bash
revkit pr
```

That's the open PR for the current branch, auto-detected: no `--pr` needed
when there's exactly one candidate.

If the branch has more than one open PR/MR, this exits with code 2 and a
`multiple_merge_requests` candidate list on stdout instead of guessing. See
[Output contract](output-schema.md#exit-codes).

## `revkit status`

```bash
revkit status [--pr <n>]
```

Folds review feedback and pipeline state into one readiness check:
`{ schemaVersion, ready, pr: { number, url }, feedback: { total, resolved, unresolved }, pipeline: { state, url } }`.
`ready` is `true` only when every thread is resolved and the pipeline state is
`success`.

```bash
revkit status
```

That's how a review loop typically ends: `revkit comments --unresolved` →
address each → `revkit reply <id> "…" --resolve` → `revkit status` to confirm
`ready: true`.

## `revkit rerequest`

```bash
revkit rerequest --reviewer <name> [--reviewer <name> ...] [--pr <n>]
```

Re-requests a review from reviewers who already reviewed the PR. Bot
reviewers (e.g. CodeRabbit) need this explicit call after fixes are pushed;
there is no implicit "all reviewers" default, which would spam humans who
already approved.

```bash
revkit rerequest --reviewer coderabbitai --reviewer alice
```

Returns `{ schemaVersion, success, reviewers: [<login>] }` with the canonical
login for each.

- Only reviewers who have **already reviewed** the PR can be re-requested;
  naming one who never reviewed exits 1 with a `revkit:` message.
- Bots match regardless of `[bot]` suffix: `--reviewer coderabbitai` and
  `--reviewer coderabbitai[bot]` are equivalent, and the canonical login is
  sent to GitHub either way.
- GitHub only for now. GitLab has no confirmed re-request endpoint
  (remove+re-add of `reviewer_ids` is unverified, and `reset_approvals` is the
  wrong tool), so it exits with a clear message pending
  [#4](https://github.com/konradmichalik/revkit/issues/4).

## See also

- [Review comments](comments.md): filtering, diff context, full reply chains
- [Output contract](output-schema.md): the `schemaVersion` envelope and exit
  codes shared by every command
