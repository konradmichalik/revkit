import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execText, execJSON } from '../src/exec.js'

describe('execText', () => {
  it('returns trimmed stdout', () => {
    const result = execText('echo "hello world"')
    assert.equal(result, 'hello world')
  })

  it('throws on failed command', () => {
    assert.throws(
      () => execText('command_that_does_not_exist_xyz'),
      /Error/
    )
  })
})

describe('execJSON', () => {
  it('parses JSON output', () => {
    const result = execJSON('echo \'{"key": "value"}\'')
    assert.deepEqual(result, { key: 'value' })
  })

  it('throws on invalid JSON', () => {
    assert.throws(
      () => execJSON('echo "not json"'),
      /Expected JSON/
    )
  })
})
