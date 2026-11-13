import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { checkOnly, checkStories, collectTags, failed } from '../../scripts/check-stories.mjs'

describe('check-stories', () => {
  it('reports untagged stories and tags that name no story', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tags-'))
    mkdirSync(path.join(dir, 'nested'))
    writeFileSync(
      path.join(dir, 'core.spec.ts'),
      "test('block page @IN-03 @HY-05', () => {})\ntest('x', { tag: ['@RA-20'] }, () => {})\n",
    )
    writeFileSync(path.join(dir, 'nested', 'more.spec.ts'), "test('ghost @RA-99', () => {})\n")
    writeFileSync(path.join(dir, 'helper.ts'), '// @IN-04 in a non-spec file is ignored\n')
    const result = checkStories(['IN-03', 'IN-04', 'HY-05', 'RA-20'], collectTags(dir))
    assert.deepEqual(result, { total: 4, tagged: 3, missing: ['IN-04'], unknown: ['RA-99'] })
  })

  it('fails on unknown tags always and on missing stories only when strict', () => {
    const base = { total: 2, tagged: 2, missing: [], unknown: [] }
    assert.equal(failed(base, false), false)
    assert.equal(failed(base, true), false)
    const missing = { ...base, tagged: 1, missing: ['IN-04'] }
    assert.equal(failed(missing, false), false)
    assert.equal(failed(missing, true), true)
    const unknown = { ...base, unknown: ['RA-99'] }
    assert.equal(failed(unknown, false), true)
  })

  it('names the stories of one package that have no test, and typos', () => {
    const tags = new Map([['NX-10', new Set(['a.spec.ts'])]])
    const ids = ['NX-10', 'NX-11', 'NX-12']
    assert.deepEqual(checkOnly(ids, ['NX-10', 'NX-11'], tags), {
      covered: 1,
      missing: ['NX-11'],
      unknown: [],
    })
    assert.deepEqual(checkOnly(ids, ['NX-10', 'NX-99'], tags), {
      covered: 1,
      missing: [],
      unknown: ['NX-99'],
    })
  })
})
