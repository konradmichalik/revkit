import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { findPR, MultipleMRsError, _deps } from '../src/pr.js'

describe('MultipleMRsError', () => {
  it('stores candidates and has descriptive message', () => {
    const candidates = [
      { number: 675, title: 'feat-x', target: 'stage', draft: false, author: 'alice', url: 'https://example.com/675' },
      { number: 674, title: 'feat-x', target: 'main', draft: true, author: 'alice', url: 'https://example.com/674' },
    ]
    const err = new MultipleMRsError(candidates)

    assert.ok(err instanceof Error)
    assert.ok(err.message.includes('--pr'))
    assert.equal(err.candidates.length, 2)
    assert.equal(err.candidates[0].number, 675)
  })
})

const GITLAB_DETECT = { platform: 'gitlab', owner: 'group/sub', repo: 'project', branch: 'feat/my-branch' }

const MR_API_RESPONSE = (iid) => ({
  iid,
  title: `MR ${iid}`,
  web_url: `https://gitlab.com/mr/${iid}`,
  state: 'opened',
  sha: 'abc123',
  author: { username: 'alice' },
})

const MR_LIST_ITEM = (iid, target, draft = false) => ({
  iid,
  title: `MR ${iid}`,
  target_branch: target,
  draft,
  work_in_progress: false,
  author: { username: 'alice' },
  web_url: `https://gitlab.com/mr/${iid}`,
})

describe('findGitLabMR', () => {
  let originalDetect
  let originalExecJSON

  beforeEach(() => {
    originalDetect = _deps.detect
    originalExecJSON = _deps.execJSON
    _deps.detect = () => GITLAB_DETECT
  })

  afterEach(() => {
    _deps.detect = originalDetect
    _deps.execJSON = originalExecJSON
  })

  it('with --pr: fetches MR directly via REST API', () => {
    const calls = []
    _deps.execJSON = (cmd) => {
      calls.push(cmd)
      return MR_API_RESPONSE(674)
    }

    const result = findPR({ number: 674 })

    assert.equal(result.platform, 'gitlab')
    assert.equal(result.number, 674)
    assert.equal(result.headSha, 'abc123')
    assert.ok(calls[0].includes('merge_requests/674'))
  })

  it('without --pr, 1 MR: auto-selects the single MR', () => {
    const calls = []
    _deps.execJSON = (cmd) => {
      calls.push(cmd)
      if (cmd.includes('source_branch=')) return [MR_LIST_ITEM(675, 'stage')]
      if (cmd.includes('merge_requests/675')) return MR_API_RESPONSE(675)
      throw new Error(`Unexpected cmd: ${cmd}`)
    }

    const result = findPR()

    assert.equal(result.number, 675)
    assert.equal(calls.length, 2)
  })

  it('without --pr, >1 MRs: throws MultipleMRsError with candidates', () => {
    _deps.execJSON = () => [
      MR_LIST_ITEM(675, 'stage', false),
      MR_LIST_ITEM(674, 'main', true),
    ]

    assert.throws(() => findPR(), (err) => {
      assert.ok(err instanceof MultipleMRsError)
      assert.equal(err.candidates.length, 2)
      assert.equal(err.candidates[0].target, 'stage')
      assert.equal(err.candidates[1].draft, true)
      assert.deepEqual(
        Object.keys(err.candidates[0]).sort(),
        ['author', 'draft', 'number', 'target', 'title', 'url']
      )
      return true
    })
  })

  it('without --pr, 0 MRs: falls through to glab mr view', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('source_branch=')) return []
      if (cmd.includes('glab mr view')) return MR_API_RESPONSE(999)
      throw new Error(`Unexpected cmd: ${cmd}`)
    }

    const result = findPR()
    assert.equal(result.number, 999)
  })

  it('encodes branch name with special characters', () => {
    _deps.detect = () => ({ ...GITLAB_DETECT, branch: 'feat/foo&bar' })
    const calls = []
    _deps.execJSON = (cmd) => {
      calls.push(cmd)
      if (cmd.includes('source_branch=')) {
        assert.ok(cmd.includes('feat%2Ffoo%26bar'), 'branch should be URL-encoded')
        return [MR_LIST_ITEM(1, 'main')]
      }
      return MR_API_RESPONSE(1)
    }

    findPR()
  })
})
