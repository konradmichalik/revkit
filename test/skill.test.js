import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf-8')

// Canonical command surface. If a subcommand is added/removed in bin, this list
// must change too — which forces SKILL.md to be kept in sync (CI guard).
const COMMANDS = ['detect', 'pr', 'comments', 'reply', 'resolve', 'checks', 'status']

describe('SKILL.md stays in sync with the CLI', () => {
  it('documents every subcommand', () => {
    for (const cmd of COMMANDS) {
      assert.ok(skill.includes(`revkit ${cmd}`), `SKILL.md is missing "revkit ${cmd}"`)
    }
  })

  it('documents all three exit codes', () => {
    for (const code of ['0', '1', '2']) {
      assert.match(skill, new RegExp(`\\*\\*${code}\\*\\*`), `SKILL.md is missing exit code ${code}`)
    }
  })

  it('documents the fork-PR overrides', () => {
    assert.match(skill, /--repo/)
    assert.match(skill, /--remote/)
  })

  it('is shipped in the npm package', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    assert.ok(pkg.files.includes('SKILL.md'), 'SKILL.md must be listed in package.json "files"')
  })
})
