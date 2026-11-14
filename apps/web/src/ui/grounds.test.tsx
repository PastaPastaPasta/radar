import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, Section } from './layout'

const css = readFileSync(join(import.meta.dirname, '../styles/radar-components.css'), 'utf8')
const flat = css.replace(/\s+/g, ' ')

describe('section grounds @W2-42', () => {
  it('lets a card or a section name the ground it stands on, and names none by default', () => {
    render(
      <>
        <Card id="a" title="A" ground="band">
          a
        </Card>
        <Card id="b" title="B">
          b
        </Card>
        <Section id="c" title="C" layer="platform" ground="layer">
          c
        </Section>
        <Section id="d" title="D" ground="page">
          d
        </Section>
      </>,
    )
    const ground = (id: string) => document.getElementById(id)?.getAttribute('data-ground') ?? null
    expect(ground('a')).toBe('band')
    expect(ground('b')).toBeNull()
    expect(ground('c')).toBe('layer')
    expect(ground('d')).toBe('page')
  })

  it('raises every second block of a page, unless the block asks for the page ground', () => {
    expect(flat).toContain(
      ":is(.rx-page, [data-grounds]) > :nth-child(even of :is(.rx-sec--ruled, .rx-card, :has(> .rx-sec--ruled))):not([data-ground='page']), [data-ground='band'], [data-ground='layer'] {",
    )
  })

  it('draws a ground as a band the width of the window with no edge, never a bordered box', () => {
    const rule = /\[data-ground='band'\], \[data-ground='layer'\] \{([^}]*)\}/.exec(flat)?.[1] ?? ''
    expect(rule).toContain(
      'border-image: conic-gradient(var(--rx-ground) 0 0) fill 0 / 0 / 0 100vw',
    )
    expect(rule).toContain('border-top: 0')
    expect(rule).not.toMatch(/border-radius|box-shadow|outline/)
  })

  it('puts a section about another layer on that layer’s ground', () => {
    expect(flat).toContain("[data-ground='layer'] { --rx-ground: var(--rx-l-soft); }")
  })

  it('draws no rule on the section after a band: the change of ground is the rule', () => {
    expect(flat).toMatch(
      /:is\(\[data-ground='band'\], \[data-ground='layer'\]\) \+ \.rx-sec--ruled \{ border-top-color: transparent;/,
    )
  })
})
