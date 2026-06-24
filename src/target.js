import { execFileText } from './exec.js'

// Mutable deps for testing — tests can replace readRemoteUrl with a mock
export const _deps = {
  readRemoteUrl: (name) => execFileText('git', ['remote', 'get-url', name]),
}

// owner/repo/host/remote are interpolated into gh/glab shell commands downstream,
// so reject anything outside a safe charset to prevent command injection.
const SAFE_PATTERNS = {
  host: /^[A-Za-z0-9.-]+$/,
  owner: /^[A-Za-z0-9._/-]+$/,
  repo: /^[A-Za-z0-9._-]+$/,
  remote: /^[A-Za-z0-9._/-]+$/,
}

function assertSafe(value, kind) {
  if (!SAFE_PATTERNS[kind].test(value)) {
    throw new Error(`Unsafe ${kind} value: ${value}`)
  }
  return value
}

const PROTO_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i
const SCP_PATTERN = /^(?:[^@]+@)?([^/:]+):(.+)$/

function splitOwnerRepo(path, source) {
  const clean = path.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  const segments = clean.split('/').filter(Boolean)
  const repo = segments.pop()
  const owner = segments.join('/')
  if (!owner || !repo) {
    throw new Error(`Could not parse owner/repo from ${source}`)
  }
  return { owner, repo }
}

export function parseRemoteUrl(url) {
  const proto = url.match(PROTO_PATTERN)
  const scp = !proto && url.match(SCP_PATTERN)

  if (!proto && !scp) {
    throw new Error(`Could not parse remote URL: ${url}`)
  }

  const [, host, path] = proto || scp
  return { host, ...splitOwnerRepo(path, `remote URL: ${url}`) }
}

export function parseRepoSlug(slug) {
  return splitOwnerRepo(slug, `--repo value (expected owner/repo): ${slug}`)
}

export function resolveTarget(options = {}, env = process.env) {
  const remoteName = assertSafe(options.remote || env.REVKIT_REMOTE || 'origin', 'remote')
  const parsed = parseRemoteUrl(_deps.readRemoteUrl(remoteName))

  // owner/repo come from --repo / REVKIT_REPO if given, else from the remote URL.
  // A --remote flag suppresses REVKIT_REPO (flags win over env as a group).
  const repoSlug = options.repo || (options.remote ? null : env.REVKIT_REPO)
  const { owner, repo } = repoSlug ? parseRepoSlug(repoSlug) : parsed

  const source =
    options.repo || options.remote ? 'flag' : env.REVKIT_REPO || env.REVKIT_REMOTE ? 'env' : 'default'

  assertSafe(parsed.host, 'host')
  assertSafe(owner, 'owner')
  assertSafe(repo, 'repo')

  return { host: parsed.host, owner, repo, remote: remoteName, source }
}
