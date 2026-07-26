import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseFlag, parseFlagAll, parseTarget, positional } from '../src/args.js'

describe('parseFlag', () => {
  it('returns the value after the flag', () => {
    assert.equal(parseFlag(['--pr', '42'], '--pr'), '42')
  })

  it('returns null when flag is absent', () => {
    assert.equal(parseFlag(['--pr', '42'], '--repo'), null)
  })

  it('returns null when flag has no value', () => {
    assert.equal(parseFlag(['--pr'], '--pr'), null)
  })
})

describe('parseFlagAll', () => {
  it('collects every value for a repeated flag', () => {
    assert.deepEqual(parseFlagAll(['--author', 'a', '--author', 'b'], '--author'), ['a', 'b'])
  })

  it('returns a single value when the flag appears once', () => {
    assert.deepEqual(parseFlagAll(['--author', 'a', '--pr', '5'], '--author'), ['a'])
  })

  it('returns an empty array when the flag is absent', () => {
    assert.deepEqual(parseFlagAll(['--pr', '5'], '--author'), [])
  })

  it('ignores a trailing flag with no value', () => {
    assert.deepEqual(parseFlagAll(['--author', 'a', '--author'], '--author'), ['a'])
  })

  it('does not treat a following option as a value', () => {
    assert.deepEqual(parseFlagAll(['--reviewer', '--pr', '42'], '--reviewer'), [])
  })
})

describe('parseTarget', () => {
  it('extracts --repo and --remote', () => {
    assert.deepEqual(parseTarget(['--repo', 'o/r', '--remote', 'upstream']), {
      repo: 'o/r',
      remote: 'upstream',
    })
  })

  it('omits absent flags', () => {
    assert.deepEqual(parseTarget(['--pr', '5']), {})
  })
})

describe('positional', () => {
  it('keeps positional args and strips value-flags with their values', () => {
    assert.deepEqual(positional(['abc123', 'hello', '--pr', '42']), ['abc123', 'hello'])
  })

  it('strips --repo and --remote with their values', () => {
    assert.deepEqual(positional(['id', 'body', '--repo', 'o/r', '--remote', 'up']), ['id', 'body'])
  })

  it('preserves a reply body that starts with -- (not mangled as a flag)', () => {
    // regression: previously any --* token was dropped, breaking such bodies
    assert.deepEqual(positional(['id', '--repo is the flag you want']), [
      'id',
      '--repo is the flag you want',
    ])
  })

  it('preserves --* payload tokens interleaved with a parsed flag', () => {
    assert.deepEqual(positional(['id', 'use', '--foo', 'bar', '--pr', '7']), [
      'id',
      'use',
      '--foo',
      'bar',
    ])
  })
})
