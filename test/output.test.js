import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execText } from '../src/exec.js'

describe('output helpers via CLI', () => {
  it('revkit help prints usage to stdout', () => {
    const result = execText('node bin/revkit.js help', {
      cwd: process.cwd(),
    })
    assert.ok(result.includes('revkit'))
    assert.ok(result.includes('detect'))
    assert.ok(result.includes('comments'))
  })

  it('revkit detect outputs valid JSON', () => {
    const result = execText('node bin/revkit.js detect', {
      cwd: process.cwd(),
    })
    const parsed = JSON.parse(result)
    assert.equal(parsed.platform, 'github')
  })
})
