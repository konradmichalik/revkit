import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractHunk,
  gitlabDiffHunk,
  replyAndResolve,
  applyFilters,
  listGitHubComments,
  listGitLabComments,
  _deps,
} from '../src/comments.js'

const DIFF = [
  '@@ -1,3 +1,4 @@',
  ' context a',
  '-old line',
  '+new line 1',
  '+new line 2',
  ' context b',
  '@@ -20,2 +21,3 @@',
  ' context c',
  '+added at 22',
  ' context d',
].join('\n')

describe('extractHunk', () => {
  it('returns the hunk covering a new-side line', () => {
    const hunk = extractHunk(DIFF, { new_line: 2 })
    assert.match(hunk, /^@@ -1,3 \+1,4 @@/)
    assert.match(hunk, /new line 1/)
    assert.doesNotMatch(hunk, /context c/) // not the second hunk
  })

  it('picks the second hunk when the line falls in its new range', () => {
    const hunk = extractHunk(DIFF, { new_line: 22 })
    assert.match(hunk, /^@@ -20,2 \+21,3 @@/)
    assert.match(hunk, /added at 22/)
  })

  it('falls back to the old-side line when new_line is absent', () => {
    const hunk = extractHunk(DIFF, { new_line: null, old_line: 2 })
    assert.match(hunk, /^@@ -1,3 \+1,4 @@/)
  })

  it('returns null when no hunk covers the line (outdated position)', () => {
    assert.equal(extractHunk(DIFF, { new_line: 999 }), null)
  })

  it('returns null for empty diff or missing position', () => {
    assert.equal(extractHunk('', { new_line: 1 }), null)
    assert.equal(extractHunk(DIFF, null), null)
    assert.equal(extractHunk(DIFF, { new_line: null, old_line: null }), null)
  })

  it('handles a single-line hunk header without explicit counts', () => {
    const diff = ['@@ -5 +5 @@', ' only line'].join('\n')
    assert.match(extractHunk(diff, { new_line: 5 }), /only line/)
    assert.equal(extractHunk(diff, { new_line: 6 }), null)
  })
})

describe('gitlabDiffHunk', () => {
  const diffs = [
    { new_path: 'src/a.js', old_path: 'src/a.js', diff: DIFF },
    { new_path: 'src/b.js', old_path: 'src/b.js', diff: '@@ -1,1 +1,1 @@\n-x\n+y' },
  ]

  it('matches the diff by new_path and extracts the hunk', () => {
    const hunk = gitlabDiffHunk(diffs, { new_path: 'src/a.js', new_line: 2 })
    assert.match(hunk, /new line 1/)
  })

  it('matches by old_path when new_path differs (rename)', () => {
    const renamed = [{ new_path: 'renamed.js', old_path: 'src/a.js', diff: DIFF }]
    const hunk = gitlabDiffHunk(renamed, { old_path: 'src/a.js', new_path: 'renamed.js', new_line: 2 })
    assert.match(hunk, /new line 1/)
  })

  it('returns null when no diff matches the path (deleted file)', () => {
    assert.equal(gitlabDiffHunk(diffs, { new_path: 'gone.js', new_line: 1 }), null)
  })

  it('returns null for a general comment with no position', () => {
    assert.equal(gitlabDiffHunk(diffs, null), null)
  })

  it('returns null when diffs is not an array', () => {
    assert.equal(gitlabDiffHunk(undefined, { new_path: 'src/a.js', new_line: 2 }), null)
  })
})

describe('listGitHubComments', () => {
  let originalExecJSON

  beforeEach(() => {
    originalExecJSON = _deps.execJSON
  })

  afterEach(() => {
    _deps.execJSON = originalExecJSON
  })

  const ctx = { owner: 'octocat', repo: 'hello-world' }
  const pr = { number: 42 }

  const graphqlResult = (commentNodes) => ({
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PRRT_1',
                isResolved: false,
                path: 'src/a.js',
                line: 10,
                comments: { nodes: commentNodes },
              },
            ],
          },
        },
      },
    },
  })

  it('without --with-replies: no replies field, unchanged shape', () => {
    _deps.execJSON = () => graphqlResult([
      { id: 'c1', body: 'first', author: { login: 'reviewer' }, createdAt: '2026-08-01T00:00:00Z' },
      { id: 'c2', body: 'second', author: { login: 'author' }, createdAt: '2026-08-02T00:00:00Z' },
    ])

    const result = listGitHubComments(ctx, pr, {})

    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'c1')
    assert.equal('replies' in result[0], false)
  })

  it('with --with-replies: replies chronological, opener stays top-level', () => {
    _deps.execJSON = () => graphqlResult([
      { id: 'c1', body: 'first', author: { login: 'reviewer' }, createdAt: '2026-08-01T00:00:00Z' },
      { id: 'c2', body: 'second', author: { login: 'author' }, createdAt: '2026-08-02T00:00:00Z' },
      { id: 'c3', body: 'third', author: { login: 'reviewer' }, createdAt: '2026-08-03T00:00:00Z' },
    ])

    const result = listGitHubComments(ctx, pr, { withReplies: true })

    assert.equal(result[0].id, 'c1')
    assert.deepEqual(result[0].replies, [
      { id: 'c2', author: 'author', body: 'second', createdAt: '2026-08-02T00:00:00Z' },
      { id: 'c3', author: 'reviewer', body: 'third', createdAt: '2026-08-03T00:00:00Z' },
    ])
  })

  it('with --with-replies: a thread with no replies returns replies: []', () => {
    _deps.execJSON = () => graphqlResult([
      { id: 'c1', body: 'only comment', author: { login: 'reviewer' }, createdAt: '2026-08-01T00:00:00Z' },
    ])

    const result = listGitHubComments(ctx, pr, { withReplies: true })

    assert.deepEqual(result[0].replies, [])
  })
})

describe('listGitLabComments', () => {
  let originalExecJSON

  beforeEach(() => {
    originalExecJSON = _deps.execJSON
  })

  afterEach(() => {
    _deps.execJSON = originalExecJSON
  })

  const ctx = { owner: 'group', repo: 'project' }
  const pr = { number: 7 }

  const discussion = (notes) => [{ id: 'd1', notes }]

  it('without --with-replies: no replies field, unchanged shape', () => {
    _deps.execJSON = () => discussion([
      { id: 1, body: 'first', author: { username: 'alice' }, created_at: '2026-08-01T00:00:00Z' },
      { id: 2, body: 'second', author: { username: 'bob' }, created_at: '2026-08-02T00:00:00Z' },
    ])

    const result = listGitLabComments(ctx, pr, {})

    assert.equal(result[0].id, '1')
    assert.equal('replies' in result[0], false)
  })

  it('with --with-replies: replies included, system notes excluded', () => {
    _deps.execJSON = () => discussion([
      { id: 1, body: 'first', author: { username: 'alice' }, created_at: '2026-08-01T00:00:00Z' },
      { id: 2, body: 'resolved this thread', system: true, author: { username: 'alice' }, created_at: '2026-08-02T00:00:00Z' },
      { id: 3, body: 'second', author: { username: 'bob' }, created_at: '2026-08-03T00:00:00Z' },
    ])

    const result = listGitLabComments(ctx, pr, { withReplies: true })

    assert.deepEqual(result[0].replies, [
      { id: '3', author: 'bob', body: 'second', createdAt: '2026-08-03T00:00:00Z' },
    ])
  })

  it('with --with-replies: a discussion with no replies returns replies: []', () => {
    _deps.execJSON = () => discussion([
      { id: 1, body: 'only note', author: { username: 'alice' }, created_at: '2026-08-01T00:00:00Z' },
    ])

    const result = listGitLabComments(ctx, pr, { withReplies: true })

    assert.deepEqual(result[0].replies, [])
  })
})

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
