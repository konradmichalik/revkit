# CI/CD checks (`revkit checks`)

```bash
revkit checks [--failed] [--pr <n>]
```

Lists CI/CD check runs for the PR/MR on the current branch as
`{ schemaVersion, items: [{ name, state, conclusion, duration, url }] }`.
`--failed` narrows the list to failing/errored checks.

```bash
revkit checks --failed
```

That's every check that did not pass on the current PR.

## `--log <name>`

`checks --failed` says *that* a job failed; `checks --log <name>` says *why*,
with bounded, machine-readable output so an agent never falls back to
unbounded `gh run view --log`.

```bash
revkit checks --log "Test Suite" [--tail <n>] [--raw] [--pr <n>]
```

Returns `{ schemaVersion, name, conclusion, url, log: { lines, truncated, totalLines } }`.

```bash
revkit checks --log "Test Suite"            # last 100 lines, cleaned
revkit checks --log "Test Suite" --tail 40  # last 40 lines
revkit checks --log "Test Suite" --raw      # keep ANSI + timestamps
```

- **GitHub**: Actions-backed check runs fetch the workflow job log via
  `actions/jobs/{id}/logs`. External checks (Travis, Jenkins, review apps) and
  commit statuses expose no logs via the API, so they return `log: null` plus
  the external `url` instead of erroring.
- **GitLab**: the failing job's trace from the latest MR pipeline.
- **Log hygiene**: ANSI escapes and GitHub per-line timestamps are stripped by
  default, pure token waste for an agent; `--raw` opts out. `--tail` defaults
  to 100; `truncated` signals when lines were cut.
- Ambiguous check names reuse the exit-code-2 disambiguation pattern:
  `{ error: "multiple_checks", candidates: [...] }` on stdout. See
  [Output contract](output-schema.md#exit-codes).

## See also

- [Review workflow](review-workflow.md): `revkit status` folds pipeline state
  into one readiness check
- [Output contract](output-schema.md): the `schemaVersion` envelope and exit
  codes shared by every command
