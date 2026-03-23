import { execJSON } from './exec.js'
import { detect } from './platform.js'

export function findPR(options = {}) {
  const { platform, owner, repo } = detect()
  const number = options.number

  if (platform === 'github') {
    return findGitHubPR(owner, repo, number)
  }

  return findGitLabMR(owner, repo, number)
}

function findGitHubPR(owner, repo, number) {
  const fields = 'number,title,url,state,author'

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
  }
}
