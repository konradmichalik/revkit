import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters } from '../src/comments.js'

const COMMENTS = [
  { id: '1', author: 'alice', file: 'src/a.js', line: 10, resolved: false, createdAt: '2026-07-01T00:00:00Z' },
  { id: '2', author: 'coderabbitai[bot]', file: 'src/b.js', line: 20, resolved: false, createdAt: '2026-07-10T00:00:00Z' },
  { id: '3', author: 'bob', file: 'src/a.js', line: 30, resolved: true, createdAt: '2026-07-20T00:00:00Z' },
  { id: '4', author: null, file: null, line: null, resolved: false, createdAt: '2026-07-22T00:00:00Z' },
]

const ids = (list) => list.map((c) => c.id)

describe('applyFilters', () => {
  it('returns all comments when no filters are set', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, {})), ['1', '2', '3', '4'])
  })

  it('--unresolved keeps only unresolved threads', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { unresolved: true })), ['1', '2', '4'])
  })

  it('--file matches the file field exactly (no globbing)', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { file: 'src/a.js' })), ['1', '3'])
    assert.deepEqual(ids(applyFilters(COMMENTS, { file: 'src/' })), [])
  })

  it('--author matches a plain login', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: ['alice'] })), ['1'])
  })

  it('--author matches a bot regardless of [bot] suffix or case', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: ['coderabbitai'] })), ['2'])
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: ['CodeRabbitAI[bot]'] })), ['2'])
  })

  it('--author is OR within the flag when repeated', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: ['alice', 'bob'] })), ['1', '3'])
  })

  it('--author never matches a null author', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: ['alice'] })).includes('4'), false)
  })

  it('--since compares against createdAt, inclusive of the boundary', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { since: '2026-07-10T00:00:00Z' })), ['2', '3', '4'])
  })

  it('--since accepts a date-only string', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { since: '2026-07-20' })), ['3', '4'])
  })

  it('throws on an unparseable --since', () => {
    assert.throws(() => applyFilters(COMMENTS, { since: 'not-a-date' }), { message: /Invalid --since/ })
  })

  it('AND-combines filters (unresolved + file + author)', () => {
    const result = applyFilters(COMMENTS, { unresolved: true, file: 'src/a.js', authors: ['alice', 'bob'] })
    assert.deepEqual(ids(result), ['1']) // bob's is resolved, alice's a.js survives
  })

  it('empty result is an empty array, not an error', () => {
    assert.deepEqual(applyFilters(COMMENTS, { authors: ['nobody'] }), [])
  })

  it('empty authors array is treated as no author filter', () => {
    assert.deepEqual(ids(applyFilters(COMMENTS, { authors: [] })), ['1', '2', '3', '4'])
  })
})
