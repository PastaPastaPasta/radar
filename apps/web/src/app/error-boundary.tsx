import { t } from '@lingui/core/macro'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page failed to render', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div role="alert" className="grid gap-3">
        <h1 className="text-2xl font-semibold">{t`This page couldn’t be shown`}</h1>
        <p>{t`Something in the page broke. The rest of Radar still works.`}</p>
        <p>
          <button type="button" onClick={this.reset}>
            {t`Try again`}
          </button>
        </p>
      </div>
    )
  }
}
