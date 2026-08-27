import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { whoami, _deps } from '../src/whoami.js'

describe('whoami', () => {
  let original

  beforeEach(() => {
    original = { ...(_deps) }
  })

  afterEach(() => {
    _deps.detect = original.detect
    _deps.execText = original.execText
  })

  it('returns the GitHub login via gh api', () => {
    _deps.detect = () => ({ platform: 'github' })
    const commands = []
    _deps.execText = (cmd) => {
      commands.push(cmd)
      return 'konradmichalik'
    }

    const result = whoami({})

    assert.deepEqual(result, { user: 'konradmichalik', platform: 'github' })
    assert.equal(commands.length, 1)
    assert.match(commands[0], /^gh api user --jq \.login$/)
  })

  it('returns the GitLab username via glab api with the resolved host', () => {
    _deps.detect = () => ({ platform: 'gitlab', host: 'gitlab.com' })
    const commands = []
    _deps.execText = (cmd) => {
      commands.push(cmd)
      return 'kmichalik'
    }

    const result = whoami({})

    assert.deepEqual(result, { user: 'kmichalik', platform: 'gitlab' })
    assert.equal(commands.length, 1)
    assert.match(commands[0], /^glab api user --hostname gitlab\.com --jq \.username$/)
  })

  it('resolves a self-hosted GitLab host, consistent with detect', () => {
    _deps.detect = () => ({ platform: 'gitlab', host: 'gitlab.example.com' })
    const commands = []
    _deps.execText = (cmd) => {
      commands.push(cmd)
      return 'jdoe'
    }

    whoami({})

    assert.match(commands[0], /--hostname gitlab\.example\.com/)
  })
})
