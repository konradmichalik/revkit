import { execJSON } from './exec.js'
import { detect } from './platform.js'

export class MultipleMRsError extends Error {
  constructor(candidates) {
    super('Multiple merge requests found for this branch. Use --pr <number> to select one.')
    this.candidates = candidates
  }
}

function listBranchMRs(owner, repo, branch) {
  const projectId = encodeURIComponent(`${owner}/${repo}`)
  const branchParam = encodeURIComponent(branch)
  const mrs = execJSON(
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
  const { platform, owner, repo } = detect()
  const number = options.number

  if (platform === 'github') {
    return findGitHubPR(owner, repo, number)
  }

  return findGitLabMR(owner, repo, number)
}

function findGitHubPR(owner, repo, number) {
  const fields = 'number,title,url,state,author,headRefOid'

  const data = number
    ? execJSON(`gh pr view ${number} --repo ${owner}/${repo} --json ${fields}`)
    : execJSON(`gh pr view --json ${fields}`)

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

function findGitLabMR(owner, repo, number) {
  const cmd = number
    ? `glab mr view ${number} --output json`
    : `glab mr view --output json`

  const data = execJSON(cmd)

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
