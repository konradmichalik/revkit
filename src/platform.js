import { execText } from './exec.js'

const GITHUB_PATTERN = /github\.com[:/]([^/]+)\/([^/.]+)/
const GITLAB_PATTERN = /gitlab[^:/]*[:/]([^/]+)\/([^/.]+)/
const GENERIC_REMOTE_PATTERN = /[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/

export function detect() {
  const remoteUrl = execText('git remote get-url origin')
  const branch = execText('git branch --show-current')

  const github = remoteUrl.match(GITHUB_PATTERN)
  if (github) {
    requireCLI('gh', 'https://cli.github.com/')
    return {
      platform: 'github',
      owner: github[1],
      repo: github[2],
      branch,
    }
  }

  const gitlab = remoteUrl.match(GITLAB_PATTERN)
  if (gitlab) {
    requireCLI('glab', 'https://gitlab.com/gitlab-org/cli')
    return {
      platform: 'gitlab',
      owner: gitlab[1],
      repo: gitlab[2],
      branch,
    }
  }

  // Fallback: check if glab is authenticated for this remote (self-hosted GitLab)
  const generic = remoteUrl.match(GENERIC_REMOTE_PATTERN)
  if (generic && isGlabAuthenticated()) {
    return {
      platform: 'gitlab',
      owner: generic[1],
      repo: generic[2],
      branch,
    }
  }

  throw new Error(`Unknown platform for remote: ${remoteUrl}`)
}

function isGlabAuthenticated() {
  try {
    execText('glab auth status')
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
