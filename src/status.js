import { findPR } from './pr.js'
import { listComments } from './comments.js'
import { listChecks } from './checks.js'

export function status(options = {}) {
  const pr = findPR(options)
  const feedback = checkFeedback(options)
  const checks = listChecks(options)
  const pipeline = derivePipelineState(checks, pr)
  const ready = feedback.unresolved === 0 && pipeline.state === 'success'

  return { ready, pr: { number: pr.number, url: pr.url }, feedback, pipeline }
}

function checkFeedback(options) {
  const all = listComments(options)
  const unresolved = all.filter((c) => !c.resolved)

  return {
    total: all.length,
    resolved: all.length - unresolved.length,
    unresolved: unresolved.length,
  }
}

function derivePipelineState(checks, pr) {
  if (checks.length === 0) {
    return { state: 'none', url: null }
  }

  const failed = checks.some((c) => c.state === 'failure')
  const pending = checks.some((c) => c.state === 'pending')
  const state = failed ? 'failure' : pending ? 'pending' : 'success'

  return { state, url: pr.url + '/checks' }
}
