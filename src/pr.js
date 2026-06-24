import { execJSON as _execJSON } from './exec.js'
import { detect as _detect } from './platform.js'

// Mutable deps object for testing — tests can replace these via _deps.execJSON = mock
export const _deps = {
  execJSON: _execJSON,
  detect: _detect,
}

export class MultipleMRsError extends Error {
  constructor(candidates) {
    super('Multiple merge requests found for this branch. Use --pr <number> to select one.')
    this.candidates = candidates
  }
}

function listBranchMRs(owner, repo, branch) {
  const projectId = encodeURIComponent(`${owner}/${repo}`)
  const branchParam = encodeURIComponent(branch)
  const mrs = _deps.execJSON(
    `glab api projects/${projectId}/merge_requests?source_branch=${branchParam}&state=opened`
  )
  return mrs.map((mr) => ({
    number: mr.iid,
    title: mr.title,
    target: mr.target_branch,
    draft: mr.draft || mr.work_in_progress || false,
    author: mr.author?.username || null,
    url: mr.web_url,
  }))
}

export function findPR(options = {}) {
  const { platform, owner, repo, branch, source } = _deps.detect(options)
  const number = options.number
  const overridden = source !== undefined && source !== 'default'
  // note: source is undefined only under test mocks; real detect() always sets it

  if (platform === 'github') {
    return findGitHubPR(owner, repo, number, overridden)
  }

  return findGitLabMR(owner, repo, branch, number)
}

function findGitHubPR(owner, repo, number, overridden) {
  const fields = 'number,title,url,state,author,headRefOid'
  const repoArg = `--repo ${owner}/${repo}`

  const data = number
    ? _deps.execJSON(`gh pr view ${number} ${repoArg} --json ${fields}`)
    : overridden
      ? _deps.execJSON(`gh pr view ${repoArg} --json ${fields}`)
      : _deps.execJSON(`gh pr view --json ${fields}`)

  return {
    platform: 'github',
    number: data.number,
    title: data.title,
    url: data.url,
    state: data.state,
    author: data.author?.login || null,
    headSha: data.headRefOid || null,
  }
}

function toGitLabPR(data) {
  return {
    platform: 'gitlab',
    number: data.iid,
    title: data.title,
    url: data.web_url,
    state: data.state,
    author: data.author?.username || null,
    headSha: data.sha || null,
  }
}

function findGitLabMR(owner, repo, branch, number) {
  const projectId = encodeURIComponent(`${owner}/${repo}`)

  if (number) {
    return toGitLabPR(_deps.execJSON(`glab api projects/${projectId}/merge_requests/${number}`))
  }

  const mrs = listBranchMRs(owner, repo, branch)

  if (mrs.length > 1) {
    throw new MultipleMRsError(mrs)
  }

  if (mrs.length === 1) {
    return toGitLabPR(_deps.execJSON(`glab api projects/${projectId}/merge_requests/${mrs[0].number}`))
  }

  // 0 MRs — use glab mr view for its standard error message
  return toGitLabPR(_deps.execJSON('glab mr view --output json'))
}
