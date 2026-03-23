import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { execText } from '../src/exec.js'

function hasGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const skip = !hasGhAuth() && 'gh not authenticated'

describe('output helpers via CLI', () => {
  it('revkit help prints usage to stdout', () => {
    const result = execText('node bin/revkit.js help', {
      cwd: process.cwd(),
    })
    assert.ok(result.includes('revkit'))
    assert.ok(result.includes('detect'))
    assert.ok(result.includes('comments'))
  })

  it('revkit detect outputs valid JSON', { skip }, () => {
    const result = execText('node bin/revkit.js detect', {
      cwd: process.cwd(),
    })
    const parsed = JSON.parse(result)
    assert.equal(parsed.platform, 'github')
  })
})
