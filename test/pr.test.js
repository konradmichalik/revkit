import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MultipleMRsError } from '../src/pr.js'

describe('MultipleMRsError', () => {
  it('stores candidates and has descriptive message', () => {
    const candidates = [
      { number: 675, title: 'feat-x', target: 'stage', draft: false, author: 'alice', url: 'https://example.com/675' },
      { number: 674, title: 'feat-x', target: 'main', draft: true, author: 'alice', url: 'https://example.com/674' },
    ]
    const err = new MultipleMRsError(candidates)

    assert.ok(err instanceof Error)
    assert.ok(err.message.includes('--pr'))
    assert.equal(err.candidates.length, 2)
    assert.equal(err.candidates[0].number, 675)
  })
})
