import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { replyAndResolve } from '../src/comments.js'

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
