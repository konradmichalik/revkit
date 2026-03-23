import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detect } from '../src/platform.js'

describe('platform detection', () => {
  it('detects github from current repo', () => {
    const result = detect()

    assert.equal(result.platform, 'github')
    assert.equal(result.owner, 'konradmichalik')
    assert.equal(result.repo, 'revkit')
    assert.equal(typeof result.branch, 'string')
    assert.ok(result.branch.length > 0)
  })
})
