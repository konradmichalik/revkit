import { execJSON } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

export const _deps = { detect, execJSON, findPR }

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
