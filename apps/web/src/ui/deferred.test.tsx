import { render, screen } from '@testing-library/react'
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

function controlled() {
  let resolve!: (c: (props: { name: string }) => ReactNode) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<(props: { name: string }) => ReactNode>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { load: vi.fn(() => promise), resolve, reject }
}

class Catch extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override render() {
    return this.state.error ? <p>caught {this.state.error.message}</p> : this.props.children
  }
}

describe('deferred', () => {
  it('shows the fallback without suspending, then the component once its code arrives', async () => {
    const chunk = controlled()
    const Greeting = deferred(chunk.load, <p>loading</p>)
    render(
      <Suspense fallback={<p>suspended</p>}>
        <Greeting name="Ada" />
      </Suspense>,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(screen.queryByText('suspended')).toBeNull()

    chunk.resolve(({ name }) => <p>hello {name}</p>)
    expect(await screen.findByText('hello Ada')).toBeInTheDocument()
  })

  it('builds the fallback from the props when given a function', () => {
    const Greeting = deferred(controlled().load, ({ name }) => <p>waiting for {name}</p>)
    render(<Greeting name="Ada" />)

    expect(screen.getByText('waiting for Ada')).toBeInTheDocument()
  })

  it('loads the code once for every copy', async () => {
    const chunk = controlled()
    const Greeting = deferred(chunk.load)
    render(
      <>
        <Greeting name="a" />
        <Greeting name="b" />
      </>,
    )
    chunk.resolve(({ name }) => <p>hello {name}</p>)

    expect(await screen.findByText('hello b')).toBeInTheDocument()
    expect(chunk.load).toHaveBeenCalledTimes(1)
  })

  it('throws a failed load to the nearest error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const chunk = controlled()
    const Greeting = deferred(chunk.load)
    render(
      <Catch>
        <Greeting name="Ada" />
      </Catch>,
    )
    chunk.reject(new Error('chunk failed'))

    expect(await screen.findByText('caught chunk failed')).toBeInTheDocument()
  })

  it('re-renders three copies whose code is still loading without looping inside act', () => {
    // With React.lazy this render never returns (react/react#37556): the worker spins until it runs out of heap.
    const pieces = [controlled(), controlled(), controlled()].map((c) => deferred(c.load))
    function Parent() {
      const [, bump] = useState(0)
      useEffect(() => bump(1), [])
      return pieces.map((Piece, i) => (
        <Suspense key={i} fallback={null}>
          <Piece name={String(i)} />
        </Suspense>
      ))
    }

    render(<Parent />)

    expect(document.body.textContent).toBe('')
  })
})
