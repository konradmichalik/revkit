import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'

function hasGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const skip = !hasGhAuth() && 'gh not authenticated'

describe('platform detection', () => {
  it('detects github from current repo', { skip }, async () => {
    const { detect } = await import('../src/platform.js')
    const result = detect()

    assert.equal(result.platform, 'github')
    assert.equal(result.owner, 'konradmichalik')
    assert.equal(typeof result.branch, 'string')
    assert.ok(result.branch.length > 0)
  })
})
