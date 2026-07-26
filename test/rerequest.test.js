import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { rerequest, resolveReviewers, _deps } from '../src/rerequest.js'

const REVIEWS = [
  { user: { login: 'alice' }, state: 'APPROVED' },
  { user: { login: 'coderabbitai[bot]' }, state: 'CHANGES_REQUESTED' },
  { user: { login: 'alice' }, state: 'COMMENTED' }, // reviewed twice
]

describe('resolveReviewers', () => {
  it('returns the canonical login for a plain user', () => {
    assert.deepEqual(resolveReviewers(['alice'], REVIEWS), ['alice'])
  })

  it('matches a bot typed without the [bot] suffix and returns the canonical form', () => {
    assert.deepEqual(resolveReviewers(['coderabbitai'], REVIEWS), ['coderabbitai[bot]'])
  })

  it('matches a bot typed with the [bot] suffix too', () => {
    assert.deepEqual(resolveReviewers(['coderabbitai[bot]'], REVIEWS), ['coderabbitai[bot]'])
  })

  it('dedupes a reviewer who reviewed multiple times', () => {
    assert.deepEqual(resolveReviewers(['alice', 'alice'], REVIEWS), ['alice'])
  })

  it('throws when a requested reviewer never reviewed the PR', () => {
    assert.throws(() => resolveReviewers(['bob'], REVIEWS), { message: /has not reviewed this PR: bob/ })
  })
})

describe('rerequest', () => {
  let original

  beforeEach(() => {
    original = { ...(_deps) }
    _deps.detect = () => ({ platform: 'github', owner: 'acme', repo: 'app' })
    _deps.findPR = () => ({ number: 42 })
  })

  afterEach(() => {
    _deps.detect = original.detect
    _deps.execJSON = original.execJSON
    _deps.findPR = original.findPR
  })

  it('throws when no reviewers are given', () => {
    assert.throws(() => rerequest([]), { message: /at least one --reviewer/ })
  })

  it('posts requested_reviewers with canonical logins and returns them', () => {
    const commands = []
    _deps.execJSON = (cmd) => {
      commands.push(cmd)
      if (cmd.includes('/reviews')) {
        return REVIEWS
      }
      return {} // requested_reviewers POST response
    }

    const result = rerequest(['coderabbitai', 'alice'], {})

    assert.deepEqual(result, { success: true, reviewers: ['coderabbitai[bot]', 'alice'] })
    const post = commands.find((c) => c.includes('requested_reviewers'))
    assert.match(post, /-X POST/)
    assert.match(post, /reviewers\[\]=coderabbitai\[bot\]/)
    assert.match(post, /reviewers\[\]=alice/)
  })

  it('does not POST when a reviewer never reviewed (throws first)', () => {
    const commands = []
    _deps.execJSON = (cmd) => {
      commands.push(cmd)
      if (cmd.includes('/reviews')) {
        return REVIEWS
      }
      return {}
    }

    assert.throws(() => rerequest(['ghost'], {}), { message: /has not reviewed/ })
    assert.equal(commands.some((c) => c.includes('requested_reviewers')), false)
  })

  it('throws a clear error on GitLab', () => {
    _deps.detect = () => ({ platform: 'gitlab', owner: 'g', repo: 'p' })
    assert.throws(() => rerequest(['alice'], {}), { message: /not supported on GitLab/ })
  })
})
