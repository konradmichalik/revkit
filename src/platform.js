import { execText } from './exec.js'
import { resolveTarget } from './target.js'

export function detect(options = {}) {
  const target = resolveTarget(options)
  const branch = execText('git branch --show-current')
  const platform = detectPlatform(target.host)

  return {
    platform,
    owner: target.owner,
    repo: target.repo,
    branch,
    remote: target.remote,
    source: target.source,
  }
}

function detectPlatform(host) {
  if (/github/i.test(host)) {
    requireCLI('gh', 'https://cli.github.com/')
    return 'github'
  }

  if (/gitlab/i.test(host)) {
    requireCLI('glab', 'https://gitlab.com/gitlab-org/cli')
    return 'gitlab'
  }

  // Fallback: self-hosted GitLab on a non-gitlab host — trust glab only if
  // it is authenticated for this specific host
  if (isGlabAuthenticated(host)) {
    return 'gitlab'
  }

  throw new Error(`Unknown platform for host: ${host}`)
}

function isGlabAuthenticated(host) {
  try {
    execText(`glab auth status --hostname ${host}`)
    return true
  } catch {
    return false
  }
}

function requireCLI(bin, url) {
  try {
    execText(`which ${bin}`)
  } catch {
    throw new Error(`${bin} CLI not found. Install it from ${url}`)
  }

  try {
    execText(`${bin} auth status`)
  } catch {
    throw new Error(`${bin} CLI not authenticated. Run: ${bin} auth login`)
  }
}
