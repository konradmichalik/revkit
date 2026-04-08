import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { listChecks, _deps } from '../src/checks.js'

const GITHUB_DETECT = { platform: 'github', owner: 'acme', repo: 'app', branch: 'feat/x' }
const GITLAB_DETECT = { platform: 'gitlab', owner: 'group/sub', repo: 'project', branch: 'feat/x' }

const PR = { number: 42, url: 'https://example.com/pr/42', headSha: 'abc123' }

describe('listChecks — GitHub', () => {
  let originalDetect, originalExecJSON, originalFindPR

  beforeEach(() => {
    originalDetect = _deps.detect
    originalExecJSON = _deps.execJSON
    originalFindPR = _deps.findPR
    _deps.detect = () => GITHUB_DETECT
    _deps.findPR = () => PR
  })

  afterEach(() => {
    _deps.detect = originalDetect
    _deps.execJSON = originalExecJSON
    _deps.findPR = originalFindPR
  })

  it('maps check runs with conclusion and duration', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return {
          check_runs: [{
            name: 'Test Suite',
            status: 'completed',
            conclusion: 'success',
            output: { title: 'All 42 tests passed', summary: 'Full summary here' },
            started_at: '2026-01-01T10:00:00Z',
            completed_at: '2026-01-01T10:00:17Z',
            html_url: 'https://github.com/acme/app/actions/runs/1',
          }],
        }
      }
      if (cmd.includes('/status')) {
        return { statuses: [] }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'Test Suite')
    assert.equal(result[0].state, 'success')
    assert.equal(result[0].conclusion, 'All 42 tests passed')
    assert.equal(result[0].duration, 17)
    assert.equal(result[0].url, 'https://github.com/acme/app/actions/runs/1')
  })

  it('maps commit statuses with description as conclusion', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return { check_runs: [] }
      }
      if (cmd.includes('/status')) {
        return {
          statuses: [{
            context: 'coverage/coveralls',
            state: 'failure',
            description: 'Coverage decreased (-0.03%) to 95.458%',
            target_url: 'https://coveralls.io/builds/123',
          }],
        }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'coverage/coveralls')
    assert.equal(result[0].state, 'failure')
    assert.equal(result[0].conclusion, 'Coverage decreased (-0.03%) to 95.458%')
    assert.equal(result[0].duration, null)
    assert.equal(result[0].url, 'https://coveralls.io/builds/123')
  })

  it('deduplicates: prefers entry with conclusion over null', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return {
          check_runs: [{
            name: 'coverage/coveralls',
            status: 'completed',
            conclusion: 'failure',
            output: {},
            started_at: null,
            completed_at: null,
            html_url: 'https://github.com/check/1',
          }],
        }
      }
      if (cmd.includes('/status')) {
        return {
          statuses: [{
            context: 'coverage/coveralls',
            state: 'failure',
            description: 'Coverage decreased (-0.03%)',
            target_url: 'https://coveralls.io/builds/123',
          }],
        }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result.length, 1)
    assert.equal(result[0].conclusion, 'Coverage decreased (-0.03%)')
    assert.equal(result[0].url, 'https://coveralls.io/builds/123')
  })

  it('maps pending check runs', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return {
          check_runs: [{
            name: 'Build',
            status: 'in_progress',
            conclusion: null,
            output: {},
            started_at: '2026-01-01T10:00:00Z',
            completed_at: null,
            html_url: 'https://github.com/acme/app/actions/runs/2',
          }],
        }
      }
      if (cmd.includes('/status')) {
        return { statuses: [] }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result[0].state, 'pending')
    assert.equal(result[0].duration, null)
  })

  it('throws when no headSha available', () => {
    _deps.findPR = () => ({ number: 42, url: 'https://example.com', headSha: null })

    assert.throws(() => listChecks(), { message: /No head SHA/ })
  })

  it('returns empty array when no check runs and no statuses', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return { check_runs: [] }
      }
      if (cmd.includes('/status')) {
        return { statuses: [] }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.deepEqual(result, [])
  })

  it('falls back to output.summary when output.title is absent', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('check-runs')) {
        return {
          check_runs: [{
            name: 'Lint',
            status: 'completed',
            conclusion: 'failure',
            output: { title: null, summary: 'ESLint found 3 errors in 2 files' },
            started_at: '2026-01-01T10:00:00Z',
            completed_at: '2026-01-01T10:00:05Z',
            html_url: null,
          }],
        }
      }
      if (cmd.includes('/status')) {
        return { statuses: [] }
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result[0].conclusion, 'ESLint found 3 errors in 2 files')
  })
})

describe('listChecks — GitLab', () => {
  let originalDetect, originalExecJSON, originalFindPR

  beforeEach(() => {
    originalDetect = _deps.detect
    originalExecJSON = _deps.execJSON
    originalFindPR = _deps.findPR
    _deps.detect = () => GITLAB_DETECT
    _deps.findPR = () => PR
  })

  afterEach(() => {
    _deps.detect = originalDetect
    _deps.execJSON = originalExecJSON
    _deps.findPR = originalFindPR
  })

  it('maps GitLab jobs with failure_reason and duration', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('/pipelines')) {
        if (cmd.includes('/jobs')) {
          return [{
            name: 'phpunit',
            status: 'failed',
            failure_reason: 'script_failure',
            duration: 47.3,
            web_url: 'https://gitlab.com/job/1',
          }]
        }
        return [{ id: 999 }]
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'phpunit')
    assert.equal(result[0].state, 'failure')
    assert.equal(result[0].conclusion, 'script_failure')
    assert.equal(result[0].duration, 47)
    assert.equal(result[0].url, 'https://gitlab.com/job/1')
  })

  it('returns empty array when no pipelines', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('/pipelines')) {
        return []
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.deepEqual(result, [])
  })

  it('maps success jobs with null conclusion', () => {
    _deps.execJSON = (cmd) => {
      if (cmd.includes('/pipelines')) {
        if (cmd.includes('/jobs')) {
          return [{
            name: 'lint',
            status: 'success',
            failure_reason: null,
            duration: 12,
            web_url: 'https://gitlab.com/job/2',
          }]
        }
        return [{ id: 100 }]
      }
      throw new Error(`Unexpected: ${cmd}`)
    }

    const result = listChecks()

    assert.equal(result[0].state, 'success')
    assert.equal(result[0].conclusion, null)
    assert.equal(result[0].duration, 12)
  })
})
