import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregate, validateReview } from '../aggregate.mjs'

const story = (id, verdict, extra = {}) => ({ id, verdict, ux_delta: 0, ...extra })
const review = (shard, stories, ux, design, extra = {}) => ({
  shard,
  stories,
  scores: { ux, design, design_cap_applied: false, ...extra },
})
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`)

function synthetic() {
  return [
    review(
      'S1',
      [
        story('RA-01', 'PASS'),
        story('RA-02', 'PASS'),
        story('RA-03', 'PARTIAL'),
        story('RA-04', 'PASS'),
      ],
      6,
      7,
    ),
    review('S2', [story('NX-01', 'PASS'), story('NX-02', 'FAIL')], 5, 6),
    review('S3', [story('NX-50', 'BLOCKED'), story('PE-34', 'PASS')], 7, 8),
    review('S4', [story('PE-01', 'PASS')], 8, 5),
    review('S5', [story('IN-01', 'PASS'), story('HY-01', 'PASS'), story('HY-02', 'PASS')], 4, 6),
    review('S6', [story('X-01', 'PASS'), story('X-02', 'PARTIAL')], 9, 9),
  ]
}

describe('aggregate', () => {
  it('computes parity over all shards, excluding BLOCKED from the denominator', () => {
    const out = aggregate(synthetic())
    assert.deepEqual(out.parity.verdicts, { PASS: 10, PARTIAL: 2, FAIL: 1, BLOCKED: 1 })
    assert.equal(out.parity.stories, 14)
    near(out.parity.parity_share, 10 / 13)
    near(out.parity.parity_score, (10 / 13) * 10)
    assert.deepEqual(
      out.parity.not_pass.map((s) => s.id),
      ['RA-03', 'NX-02', 'NX-50', 'X-02'],
    )
  })

  it('weights S1-S5 UX by story count, then 3:1 with S6', () => {
    const out = aggregate(synthetic())
    const weighted = (6 * 4 + 5 * 2 + 7 * 2 + 8 * 1 + 4 * 3) / 12
    near(out.ux.story_weighted_s1_s5, weighted)
    near(out.ux.aggregate, (3 * weighted + 9) / 4)
  })

  it('averages S1-S5 design, then 1:1 with S6', () => {
    const out = aggregate(synthetic())
    near(out.design.mean_s1_s5, (7 + 6 + 8 + 5 + 6) / 5)
    near(out.design.aggregate, ((7 + 6 + 8 + 5 + 6) / 5 + 9) / 2)
  })

  it('combines overall as 0.5 UX + 0.3 design + 0.2 parity score', () => {
    const out = aggregate(synthetic())
    near(out.overall, 0.5 * out.ux.aggregate + 0.3 * out.design.aggregate + 0.2 * ((10 / 13) * 10))
    assert.equal(out.rounded.overall, Math.round(out.overall * 10) / 10)
  })

  it('carries a design cap only when two or more shards applied it', () => {
    const one = synthetic()
    one[0].scores.design_cap_applied = true
    one[0].scores.design_cap_value = 6
    assert.equal(aggregate(one).design.cap_applied, false)

    const two = synthetic()
    for (const i of [0, 3]) {
      two[i].scores.design_cap_applied = true
      two[i].scores.design_cap_value = 6.5
    }
    const out = aggregate(two)
    assert.equal(out.design.cap_applied, true)
    assert.deepEqual(out.design.cap_applied_by, ['S1', 'S4'])
    assert.ok(out.design.uncapped > 6.5)
    assert.equal(out.design.aggregate, 6.5)
  })

  it('takes the cap value only from shards that applied it', () => {
    const rs = synthetic()
    for (const i of [0, 1]) {
      rs[i].scores.design_cap_applied = true
      rs[i].scores.design_cap_value = 7.5
    }
    rs[2].scores.design_cap_value = 3
    assert.equal(aggregate(rs).design.cap_value, 7.5)
  })

  it('ignores reviewed stories that are not in the story list', () => {
    const ids = synthetic().flatMap((r) => r.stories.map((s) => s.id))
    const out = aggregate(synthetic(), { allStoryIds: ids.filter((id) => id !== 'X-02') })
    assert.equal(out.parity.stories, 13)
    assert.equal(out.parity.verdicts.PARTIAL, 1)
    assert.ok(out.warnings.some((w) => /X-02/.test(w)))
  })

  it('warns instead of guessing when a cap has no value', () => {
    const two = synthetic()
    two[0].scores.design_cap_applied = true
    two[1].scores.design_cap_applied = true
    const out = aggregate(two)
    assert.equal(out.design.aggregate, out.design.uncapped)
    assert.ok(out.warnings.some((w) => /no cap value/.test(w)))
  })

  it('counts a story once when two shards reviewed it', () => {
    const rs = synthetic()
    rs[5].stories.push(story('RA-01', 'FAIL'))
    const out = aggregate(rs)
    assert.equal(out.parity.stories, 14)
    assert.equal(out.parity.verdicts.FAIL, 1)
    assert.ok(out.warnings.some((w) => /RA-01/.test(w)))
  })

  it('counts stories missing from every review as not passing', () => {
    const ids = synthetic().flatMap((r) => r.stories.map((s) => s.id))
    const out = aggregate(synthetic(), { allStoryIds: [...ids, 'IN-02', 'IN-03'] })
    assert.deepEqual(out.parity.unreviewed_ids, ['IN-02', 'IN-03'])
    near(out.parity.parity_share, 10 / 15)
  })

  it('tallies de-duplicated defects by severity', () => {
    const rs = synthetic()
    const d = (severity, url, steps) => ({ severity, url, steps })
    rs[0].stories[0].defects = [d('high', '/a', 's1'), d('low', '/b', 's2')]
    rs[1].stories[0].defects = [d('high', '/a', 's1'), d('blocker', '/c', 's3')]
    assert.deepEqual(aggregate(rs).defects, { blocker: 1, high: 1, medium: 0, low: 1 })
  })

  it('still reports when shards are missing', () => {
    const out = aggregate(synthetic().slice(0, 2))
    assert.ok(out.warnings.some((w) => /missing shards: S3, S4, S5/.test(w)))
    near(out.ux.aggregate, out.ux.story_weighted_s1_s5)
  })

  it('has no pass/fail field', () => {
    const json = JSON.stringify(aggregate(synthetic()))
    assert.doesNotMatch(json, /"(pass|passed|ok|exit|meets|ready)"\s*:/)
  })
})

describe('validateReview', () => {
  it('rejects malformed reviews with the file name in the message', () => {
    assert.throws(
      () =>
        validateReview(
          { shard: 'S1', stories: [{ id: 'X', verdict: 'MAYBE' }], scores: {} },
          'f.json',
        ),
      /f\.json: X: bad verdict/,
    )
    assert.throws(
      () =>
        validateReview({ shard: 'S1', stories: [], scores: { ux: 'high', design: 1 } }, 'f.json'),
      /scores\.ux must be a number/,
    )
  })
})
