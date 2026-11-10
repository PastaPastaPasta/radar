import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { checkStories, collectTags } from '../../scripts/check-stories.mjs'

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
})
