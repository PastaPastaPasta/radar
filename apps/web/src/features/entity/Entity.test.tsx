import { screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { registerLabelOverlay, systemContract } from '@/lib/well-known'
import { Entity } from './Entity'
import { renderInApp } from './test-utils'

const DPNS = systemContract('dpns').id
const OTHER = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

describe('Entity labels', () => {
  it('names a well-known contract and leaves other ids as they are', async () => {
    await renderInApp(
      <>
        <Entity kind="contract" id={DPNS} />
        <Entity kind="identity" id={OTHER} />
      </>,
    )
    expect(await screen.findByRole('link', { name: /DPNS/ })).toBeInTheDocument()
    expect(screen.queryByText('Platform system')).not.toBeInTheDocument()
  })

  it('lets an explicit label win, and follows a label overlay as it changes', async () => {
    await renderInApp(
      <>
        <Entity kind="contract" id={DPNS} label="Names" />
        <Entity kind="identity" id={OTHER} />
      </>,
    )
    expect(await screen.findByText('Names')).toBeInTheDocument()
    let remove: () => void = () => undefined
    act(() => {
      remove = registerLabelOverlay((_n, kind, id) =>
        kind === 'identity' && id === OTHER ? 'My friend' : undefined,
      )
    })
    expect(await screen.findByText('My friend')).toBeInTheDocument()
    act(() => remove())
    expect(screen.queryByText('My friend')).not.toBeInTheDocument()
  })
})
