import { execJSON, execText } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

export const _deps = { detect, execJSON, execText, findPR }

// Multiple checks share the requested name — mirrors MultipleMRsError so bin can
// emit the same exit-code-2 disambiguation envelope with candidates as JSON.
export class MultipleChecksError extends Error {
  constructor(candidates) {
    super('Multiple checks match this name. Disambiguate with an exact name.')
    this.candidates = candidates
  }
}

const DEFAULT_TAIL = 100

export function listChecks(options = {}) {
  const ctx = _deps.detect(options)
  const pr = _deps.findPR(options)

  if (ctx.platform === 'github') {
    return listGitHubChecks(ctx, pr)
  }

  return listGitLabChecks(ctx, pr)
}

function listGitHubChecks(ctx, pr) {
  const { owner, repo } = ctx

  if (!pr.headSha) {
    throw new Error('No head SHA available for this PR')
  }

  const checkRuns = fetchCheckRuns(owner, repo, pr.headSha)
  const commitStatuses = fetchCommitStatuses(owner, repo, pr.headSha)

  return deduplicateChecks([...checkRuns, ...commitStatuses])
}

function fetchCheckRuns(owner, repo, sha) {
  const result = _deps.execJSON(
    `gh api repos/${owner}/${repo}/commits/${sha}/check-runs --paginate`
  )

  if (!result.check_runs || result.check_runs.length === 0) {
    return []
  }

  return result.check_runs.map((run) => ({
    name: run.name,
    state: mapGitHubCheckState(run),
    conclusion: run.output?.title || run.output?.summary?.slice(0, 200) || null,
    duration: calcDuration(run.started_at, run.completed_at),
    url: run.html_url || null,
  }))
}

function fetchCommitStatuses(owner, repo, sha) {
  const result = _deps.execJSON(
    `gh api repos/${owner}/${repo}/commits/${sha}/status`
  )

  if (!result.statuses || result.statuses.length === 0) {
    return []
  }

  return result.statuses.map((s) => ({
    name: s.context,
    state: mapGitHubStatusState(s.state),
    conclusion: s.description || null,
    duration: null,
    url: s.target_url || null,
  }))
}

function deduplicateChecks(checks) {
  const seen = new Map()
  for (const check of checks) {
    const existing = seen.get(check.name)
    if (!existing || (existing.conclusion === null && check.conclusion !== null)) {
      seen.set(check.name, check)
    }
  }
  return [...seen.values()]
}

function calcDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return null
  }
  return Math.round((new Date(completedAt) - new Date(startedAt)) / 1000)
}

function mapGitHubCheckState(run) {
  if (run.status !== 'completed') {
    return 'pending'
  }
  if (run.conclusion === 'success' || run.conclusion === 'skipped') {
    return 'success'
  }
  return 'failure'
}

function mapGitHubStatusState(state) {
  const map = {
    success: 'success',
    error: 'failure',
    failure: 'failure',
    pending: 'pending',
  }
  return map[state] || state
}

function listGitLabChecks(ctx, pr) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)

  const pipelines = _deps.execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/pipelines`
  )

  if (!pipelines.length) {
    return []
  }

  const latest = pipelines[0]
  const jobs = _deps.execJSON(
    `glab api projects/${projectId}/pipelines/${latest.id}/jobs`
  )

  return jobs.map((job) => ({
    name: job.name,
    state: mapGitLabState(job.status),
    conclusion: job.failure_reason || null,
    duration: job.duration !== null && job.duration !== undefined ? Math.round(job.duration) : null,
    url: job.web_url || null,
  }))
}

function mapGitLabState(status) {
  const map = {
    success: 'success',
    failed: 'failure',
    canceled: 'failure',
    skipped: 'success',
    running: 'pending',
    pending: 'pending',
    created: 'pending',
    manual: 'pending',
  }
  return map[status] || status
}

// ── Log fetching (`checks --log <name>`) ───────────────────────────────────

export function fetchCheckLog(name, options = {}) {
  const ctx = _deps.detect(options)
  const pr = _deps.findPR(options)
  const tail = options.tail || DEFAULT_TAIL
  const raw = options.raw || false

  if (ctx.platform === 'github') {
    return githubCheckLog(ctx, pr, name, { tail, raw })
  }

  return gitlabCheckLog(ctx, pr, name, { tail, raw })
}

function githubCheckLog(ctx, pr, name, { tail, raw }) {
  if (!pr.headSha) {
    throw new Error('No head SHA available for this PR')
  }

  const targets = githubLogTargets(ctx.owner, ctx.repo, pr.headSha)
  const target = matchOne(targets, name)

  // External (non-Actions) checks — commit statuses and app check-runs — expose
  // no logs via the API. Return log:null + the external URL instead of erroring.
  if (!target.jobId) {
    return { name: target.name, conclusion: target.conclusion, url: target.url, log: null }
  }

  const text = _deps.execText(
    `gh api repos/${ctx.owner}/${ctx.repo}/actions/jobs/${target.jobId}/logs`
  )

  return {
    name: target.name,
    conclusion: target.conclusion,
    url: target.url,
    log: processLog(text, { tail, raw }),
  }
}

// Build the set of named log targets from Actions check-runs (which carry a job
// id in their html_url) and commit statuses (external, never have logs).
function githubLogTargets(owner, repo, sha) {
  const runs = _deps.execJSON(
    `gh api repos/${owner}/${repo}/commits/${sha}/check-runs --paginate`
  ).check_runs || []

  const statuses = _deps.execJSON(
    `gh api repos/${owner}/${repo}/commits/${sha}/status`
  ).statuses || []

  const targets = runs.map((run) => {
    const jobId = parseActionsJobId(run.html_url)
    return {
      name: run.name,
      conclusion: run.output?.title || null,
      jobId,
      url: jobId ? run.html_url : run.details_url || run.html_url || null,
    }
  })

  for (const s of statuses) {
    targets.push({ name: s.context, conclusion: s.description || null, jobId: null, url: s.target_url || null })
  }

  return targets
}

// Actions check-run html_url looks like
// https://github.com/{o}/{r}/actions/runs/{runId}/job/{jobId}
export function parseActionsJobId(htmlUrl) {
  const m = (htmlUrl || '').match(/\/actions\/runs\/\d+\/job\/(\d+)/)
  return m ? m[1] : null
}

function gitlabCheckLog(ctx, pr, name, { tail, raw }) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)

  const pipelines = _deps.execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/pipelines`
  )
  if (!pipelines.length) {
    throw new Error('No pipeline found for this merge request')
  }

  const jobs = _deps.execJSON(
    `glab api projects/${projectId}/pipelines/${pipelines[0].id}/jobs`
  )

  const target = matchOne(
    jobs.map((j) => ({ name: j.name, id: j.id, conclusion: j.failure_reason || null, url: j.web_url || null })),
    name
  )

  const text = _deps.execText(`glab api projects/${projectId}/jobs/${target.id}/trace`)

  return {
    name: target.name,
    conclusion: target.conclusion,
    url: target.url,
    log: processLog(text, { tail, raw }),
  }
}

// Exact-name match with exit-code-2 disambiguation on duplicates.
function matchOne(targets, name) {
  const matches = targets.filter((t) => t.name === name)
  if (matches.length === 0) {
    throw new Error(`No check named "${name}" on this PR`)
  }
  if (matches.length > 1) {
    throw new MultipleChecksError(matches.map((m) => ({ name: m.name, url: m.url })))
  }
  return matches[0]
}

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g')
const GITHUB_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/

// Bound and clean a raw log. ANSI escapes and (GitHub) per-line timestamps are
// pure token waste for an agent, so they are stripped by default; --raw opts out.
// Tailing keeps the last `tail` lines and reports whether anything was cut.
export function processLog(text, { tail = DEFAULT_TAIL, raw = false } = {}) {
  let lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop() // drop the empty element from a trailing newline
  }

  if (!raw) {
    lines = lines.map((line) => line.replace(GITHUB_TIMESTAMP, '').replace(ANSI, ''))
  }

  const totalLines = lines.length
  const truncated = totalLines > tail
  return {
    lines: truncated ? lines.slice(-tail) : lines,
    truncated,
    totalLines,
  }
}
