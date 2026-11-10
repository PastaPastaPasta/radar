import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { findDevOnlyCode } from '../../scripts/check-bundle.mjs'

describe('check-bundle', () => {
  it('flags the fixture worker, its script and the kit page, and passes a clean build', () => {
    const clean = mkdtempSync(path.join(tmpdir(), 'bundle-'))
    mkdirSync(path.join(clean, 'assets'))
    writeFileSync(path.join(clean, 'assets', 'index.js'), 'console.log("app")')
    assert.deepEqual(findDevOnlyCode(clean), [])

    const dirty = mkdtempSync(path.join(tmpdir(), 'bundle-'))
    mkdirSync(path.join(dirty, 'assets'))
    writeFileSync(path.join(dirty, 'mockServiceWorker.js'), '')
    writeFileSync(path.join(dirty, 'assets', 'a.js'), 'x="[radar-fixtures] no recorded fixture"')
    writeFileSync(path.join(dirty, 'assets', 'b.js'), 'x="Radar design system"')
    assert.equal(findDevOnlyCode(dirty).length, 3)
  })
})
