import { execJSON } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

export function listChecks(options = {}) {
  const ctx = detect()
  const pr = findPR(options)

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

  const result = execJSON(
    `gh api repos/${owner}/${repo}/commits/${pr.headSha}/check-runs --paginate`
  )

  if (!result.check_runs || result.check_runs.length === 0) {
    return []
  }

  return result.check_runs.map((run) => ({
    name: run.name,
    state: mapGitHubState(run),
    url: run.html_url || null,
  }))
}

function mapGitHubState(run) {
  if (run.status !== 'completed') {
    return 'pending'
  }
  if (run.conclusion === 'success' || run.conclusion === 'skipped') {
    return 'success'
  }
  return 'failure'
}

function listGitLabChecks(ctx, pr) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)

  const pipelines = execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/pipelines`
  )

  if (!pipelines.length) {
    return []
  }

  const latest = pipelines[0]
  const jobs = execJSON(
    `glab api projects/${projectId}/pipelines/${latest.id}/jobs`
  )

  return jobs.map((job) => ({
    name: job.name,
    state: mapGitLabState(job.status),
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
