import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { execText } from '../src/exec.js'
import { json, SCHEMA_VERSION } from '../src/output.js'

describe('json — schemaVersion envelope', () => {
  let written, originalWrite

  beforeEach(() => {
    written = ''
    originalWrite = process.stdout.write
    process.stdout.write = (chunk) => {
      written += chunk
      return true
    }
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  const output = () => JSON.parse(written)

  it('adds schemaVersion to an object output', () => {
    json({ platform: 'github', number: 42 })
    assert.deepEqual(output(), { schemaVersion: SCHEMA_VERSION, platform: 'github', number: 42 })
  })

  it('wraps an array output in { schemaVersion, items }', () => {
    json([{ id: '1' }, { id: '2' }])
    assert.deepEqual(output(), { schemaVersion: SCHEMA_VERSION, items: [{ id: '1' }, { id: '2' }] })
  })

  it('wraps an empty array as items: []', () => {
    json([])
    assert.deepEqual(output(), { schemaVersion: SCHEMA_VERSION, items: [] })
  })

  it('schemaVersion is a positive integer', () => {
    assert.ok(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 1)
  })

  it('canonical schemaVersion always wins over payload data', () => {
    json({ schemaVersion: 99, platform: 'github' })
    assert.equal(output().schemaVersion, SCHEMA_VERSION)
  })
})

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
