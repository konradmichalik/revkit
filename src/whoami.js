import { execText as _execText, execJSON as _execJSON } from './exec.js'
import { detect as _detect } from './platform.js'

// Mutable deps for testing (same convention as rerequest.js / pr.js).
export const _deps = { detect: _detect, execText: _execText, execJSON: _execJSON }

// CLI installed/authenticated is already checked by detect() -> requireCLI(),
// so a missing or unauthenticated CLI surfaces via that error path, not here.
export function whoami(options = {}) {
  const { platform, host } = _deps.detect(options)

  if (platform === 'github') {
    return { user: _deps.execText('gh api user --jq .login'), platform }
  }

  // Older glab versions don't support --jq, so parse the raw JSON response instead.
  const user = _deps.execJSON(`glab api user --hostname ${host}`)
  return { user: user.username, platform }
}
