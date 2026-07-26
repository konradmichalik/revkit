import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { replyAndResolve, applyFilters } from '../src/comments.js'

describe('replyAndResolve', () => {
  it('replies then resolves — resolved:true on full success', () => {
    const calls = []
    const deps = {
      reply: (id, body) => {
        calls.push(['reply', id, body])
        return { success: true, id: 'reply-1' }
      },
      resolve: (id) => {
        calls.push(['resolve', id])
        return { success: true }
      },
      warn: () => assert.fail('warn should not be called on success'),
    }

    const result = replyAndResolve('PRRT_abc', 'thanks, fixed', {}, deps)

    assert.deepEqual(result, { success: true, id: 'reply-1', resolved: true })
    assert.deepEqual(calls, [
      ['reply', 'PRRT_abc', 'thanks, fixed'],
      ['resolve', 'PRRT_abc'],
    ])
  })

  it('reply order: resolve is only attempted after a successful reply', () => {
    const calls = []
    const deps = {
      reply: () => {
        calls.push('reply')
        return { success: true, id: 'r' }
      },
      resolve: () => {
        calls.push('resolve')
        return { success: true }
      },
      warn: () => {},
    }

    replyAndResolve('id', 'body', {}, deps)

    assert.deepEqual(calls, ['reply', 'resolve'])
  })

  it('partial failure: reply ok, resolve throws -> resolved:false, warns, no throw', () => {
    const warnings = []
    const deps = {
      reply: () => ({ success: true, id: 'reply-9' }),
      resolve: () => {
        throw new Error('403 Forbidden')
      },
      warn: (m) => warnings.push(m),
    }

    const result = replyAndResolve('id', 'body', {}, deps)

    assert.deepEqual(result, { success: true, id: 'reply-9', resolved: false })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /resolve failed/)
    assert.match(warnings[0], /403 Forbidden/)
  })

  it('reply failure propagates (nothing resolved)', () => {
    let resolveCalled = false
    const deps = {
      reply: () => {
        throw new Error('reply API error')
      },
      resolve: () => {
        resolveCalled = true
      },
      warn: () => {},
    }

    assert.throws(() => replyAndResolve('id', 'body', {}, deps), { message: /reply API error/ })
    assert.equal(resolveCalled, false)
  })

  it('forwards options (e.g. --pr) to both reply and resolve', () => {
    const seen = {}
    const deps = {
      reply: (_id, _body, opts) => {
        seen.reply = opts
        return { success: true, id: 'r' }
      },
      resolve: (_id, opts) => {
        seen.resolve = opts
        return { success: true }
      },
      warn: () => {},
    }

    replyAndResolve('id', 'body', { number: '42', repo: 'o/r' }, deps)

    assert.deepEqual(seen.reply, { number: '42', repo: 'o/r' })
    assert.deepEqual(seen.resolve, { number: '42', repo: 'o/r' })
  })
})

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
