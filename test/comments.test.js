import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractHunk, gitlabDiffHunk } from '../src/comments.js'

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
