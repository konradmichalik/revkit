import { execJSON } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

// Mutable deps for testing (same convention as checks.js / pr.js).
export const _deps = { detect, execJSON, findPR }

// A GitHub App reviewer is addressed with a [bot] suffix (coderabbitai[bot]),
// but `revkit comments` may report the same author without it. Normalize both
// to one key so a user-supplied --reviewer matches the past reviewer either way.
function normalizeLogin(login) {
  return login.toLowerCase().replace(/\[bot\]$/, '')
}

// Match each requested reviewer against the PR's past reviewers and return the
// canonical login exactly as GitHub reports it (so the [bot] suffix, if any, is
// correct for the API call). Throws if a reviewer never reviewed the PR —
// re-requesting someone who never reviewed would silently do nothing.
export function resolveReviewers(requested, reviews) {
  const canonicalByNorm = new Map()
  for (const review of reviews) {
    const login = review.user?.login
    if (login) {
      canonicalByNorm.set(normalizeLogin(login), login)
    }
  }

  const resolved = []
  for (const name of requested) {
    const canonical = canonicalByNorm.get(normalizeLogin(name))
    if (!canonical) {
      throw new Error(`Reviewer has not reviewed this PR: ${name}`)
    }
    if (!resolved.includes(canonical)) {
      resolved.push(canonical)
    }
  }
  return resolved
}

export function rerequest(reviewers, options = {}) {
  if (!reviewers || reviewers.length === 0) {
    throw new Error('rerequest requires at least one --reviewer')
  }

  const ctx = _deps.detect(options)

  if (ctx.platform === 'github') {
    return rerequestGitHub(ctx, reviewers, options)
  }

  // GitLab has no confirmed re-request endpoint; remove+re-add of reviewer_ids
  // is unverified and reset_approvals is the wrong tool (see issue #4). Fail
  // clearly rather than guess at a mutation.
  throw new Error(
    'rerequest is not supported on GitLab yet — see https://github.com/konradmichalik/revkit/issues/4'
  )
}

function rerequestGitHub(ctx, reviewers, options) {
  const { owner, repo } = ctx
  const pr = _deps.findPR(options)

  const reviews = _deps.execJSON(
    `gh api repos/${owner}/${repo}/pulls/${pr.number}/reviews --paginate`
  )

  const resolved = resolveReviewers(reviewers, reviews)
  const fields = resolved.map((r) => `-f 'reviewers[]=${r}'`).join(' ')

  _deps.execJSON(
    `gh api repos/${owner}/${repo}/pulls/${pr.number}/requested_reviewers -X POST ${fields}`
  )

  return { success: true, reviewers: resolved }
}
