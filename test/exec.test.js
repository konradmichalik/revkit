import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execText, execJSON, glabPaginated } from '../src/exec.js'

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

  it('merges concatenated JSON arrays printed one per page', () => {
    const result = execJSON('echo \'[{"id":1},{"id":2}]\' && echo \'[{"id":3}]\'')
    assert.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }])
  })

  it('merges pages when brackets appear inside strings', () => {
    const result = execJSON('printf \'[{"body":"a ][ b"}][{"body":"\\\\"]["}]\'')
    assert.deepEqual(result, [{ body: 'a ][ b' }, { body: '"][' }])
  })

  it('throws when concatenated values are not all arrays', () => {
    assert.throws(
      () => execJSON('echo \'{"a":1}{"b":2}\''),
      /Expected JSON/
    )
  })
})

describe('glabPaginated', () => {
  it('quotes the endpoint and appends the page size with ?', () => {
    assert.equal(
      glabPaginated('projects/1/merge_requests/2/discussions'),
      'glab api "projects/1/merge_requests/2/discussions?per_page=100" --paginate'
    )
  })

  it('appends the page size with & when the endpoint has a query', () => {
    assert.equal(
      glabPaginated('projects/1/merge_requests?source_branch=a&state=opened'),
      'glab api "projects/1/merge_requests?source_branch=a&state=opened&per_page=100" --paginate'
    )
  })
})
