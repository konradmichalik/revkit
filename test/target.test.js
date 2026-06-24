import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { parseRemoteUrl, parseRepoSlug, resolveTarget, _deps } from '../src/target.js'

describe('parseRemoteUrl', () => {
  it('parses SSH form (git@host:owner/repo.git)', () => {
    const r = parseRemoteUrl('git@github.com:konradmichalik/revkit.git')
    assert.deepEqual(r, { host: 'github.com', owner: 'konradmichalik', repo: 'revkit' })
  })

  it('parses SSH form without .git suffix', () => {
    const r = parseRemoteUrl('git@github.com:konradmichalik/revkit')
    assert.deepEqual(r, { host: 'github.com', owner: 'konradmichalik', repo: 'revkit' })
  })

  it('parses SSH form with GitLab subgroups', () => {
    const r = parseRemoteUrl('git@gitlab.com:group/sub/project.git')
    assert.deepEqual(r, { host: 'gitlab.com', owner: 'group/sub', repo: 'project' })
  })

  it('parses HTTPS form (https://host/owner/repo.git)', () => {
    const r = parseRemoteUrl('https://github.com/konradmichalik/revkit.git')
    assert.deepEqual(r, { host: 'github.com', owner: 'konradmichalik', repo: 'revkit' })
  })

  it('parses HTTPS form without .git and with trailing slash', () => {
    const r = parseRemoteUrl('https://github.com/konradmichalik/revkit/')
    assert.deepEqual(r, { host: 'github.com', owner: 'konradmichalik', repo: 'revkit' })
  })

  it('parses HTTPS GitLab subgroups', () => {
    const r = parseRemoteUrl('https://gitlab.example.com/group/sub/project.git')
    assert.deepEqual(r, { host: 'gitlab.example.com', owner: 'group/sub', repo: 'project' })
  })

  it('parses ssh:// form with port', () => {
    const r = parseRemoteUrl('ssh://git@gitlab.example.com:2222/group/project.git')
    assert.deepEqual(r, { host: 'gitlab.example.com', owner: 'group', repo: 'project' })
  })

  it('throws on unparseable URL', () => {
    assert.throws(() => parseRemoteUrl('not-a-url'))
  })
})

describe('parseRepoSlug', () => {
  it('parses owner/repo', () => {
    assert.deepEqual(parseRepoSlug('owner/repo'), { owner: 'owner', repo: 'repo' })
  })

  it('parses GitLab subgroups', () => {
    assert.deepEqual(parseRepoSlug('group/sub/project'), { owner: 'group/sub', repo: 'project' })
  })

  it('strips .git suffix', () => {
    assert.deepEqual(parseRepoSlug('owner/repo.git'), { owner: 'owner', repo: 'repo' })
  })

  it('throws when no slash present', () => {
    assert.throws(() => parseRepoSlug('repo'))
  })
})

describe('resolveTarget precedence', () => {
  const ORIGIN_URL = 'git@github.com:origin-owner/origin-repo.git'
  const UPSTREAM_URL = 'git@github.com:upstream-owner/upstream-repo.git'

  let original
  beforeEach(() => {
    original = _deps.readRemoteUrl
    _deps.readRemoteUrl = (name) => {
      if (name === 'origin') { return ORIGIN_URL }
      if (name === 'upstream') { return UPSTREAM_URL }
      throw new Error(`No such remote: ${name}`)
    }
  })
  afterEach(() => {
    _deps.readRemoteUrl = original
  })

  it('default: reads origin when no flags/env set', () => {
    const t = resolveTarget({}, {})
    assert.equal(t.owner, 'origin-owner')
    assert.equal(t.repo, 'origin-repo')
    assert.equal(t.remote, 'origin')
    assert.equal(t.source, 'default')
  })

  it('env REVKIT_REPO overrides default', () => {
    const t = resolveTarget({}, { REVKIT_REPO: 'env-owner/env-repo' })
    assert.equal(t.owner, 'env-owner')
    assert.equal(t.repo, 'env-repo')
    assert.equal(t.source, 'env')
  })

  it('env REVKIT_REMOTE reads that remote URL', () => {
    const t = resolveTarget({}, { REVKIT_REMOTE: 'upstream' })
    assert.equal(t.owner, 'upstream-owner')
    assert.equal(t.repo, 'upstream-repo')
    assert.equal(t.remote, 'upstream')
    assert.equal(t.source, 'env')
  })

  it('flag --repo overrides env REVKIT_REPO (flag > env)', () => {
    const t = resolveTarget({ repo: 'flag-owner/flag-repo' }, { REVKIT_REPO: 'env-owner/env-repo' })
    assert.equal(t.owner, 'flag-owner')
    assert.equal(t.repo, 'flag-repo')
    assert.equal(t.source, 'flag')
  })

  it('flag --remote overrides env (flag > env)', () => {
    const t = resolveTarget({ remote: 'upstream' }, { REVKIT_REMOTE: 'origin' })
    assert.equal(t.owner, 'upstream-owner')
    assert.equal(t.remote, 'upstream')
    assert.equal(t.source, 'flag')
  })

  it('--repo takes priority over --remote (owner/repo from flag, host from remote)', () => {
    const t = resolveTarget({ repo: 'flag-owner/flag-repo', remote: 'upstream' }, {})
    assert.equal(t.owner, 'flag-owner')
    assert.equal(t.repo, 'flag-repo')
    assert.equal(t.host, 'github.com')
    assert.equal(t.remote, 'upstream')
    assert.equal(t.source, 'flag')
  })

  it('--repo resolves host from origin when no --remote given', () => {
    const t = resolveTarget({ repo: 'flag-owner/flag-repo' }, {})
    assert.equal(t.host, 'github.com')
    assert.equal(t.remote, 'origin')
  })

  it('rejects shell metacharacters in --remote (injection guard)', () => {
    assert.throws(() => resolveTarget({ remote: 'origin; rm -rf /' }, {}), /Unsafe remote/)
  })

  it('rejects shell metacharacters in --repo (injection guard)', () => {
    assert.throws(() => resolveTarget({ repo: 'foo/$(whoami)' }, {}), /Unsafe (owner|repo)/)
  })

  it('rejects shell metacharacters in REVKIT_REPO (injection guard)', () => {
    assert.throws(() => resolveTarget({}, { REVKIT_REPO: 'a/b`id`' }), /Unsafe repo/)
  })

  it('rejects an unsafe host parsed from the remote URL (injection guard)', () => {
    _deps.readRemoteUrl = () => 'git@evil;cmd:owner/repo.git'
    assert.throws(() => resolveTarget({}, {}), /Unsafe host/)
  })
})
