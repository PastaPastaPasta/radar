import type { ErrorComponentProps } from '@tanstack/react-router'
import { ErrorBoundary, RouteError } from '@/app/error-boundary'
import { AppShell } from './AppShell'

/**
 * An error the root route caught (its own load, or a page's that failed before the shell rendered) still shows inside
 * the shell, so the header keeps working. If the shell itself is what fails, the error page shows on its own.
 */
export function RootError(props: ErrorComponentProps) {
  return (
    <ErrorBoundary fallback={() => <RouteError {...props} />}>
      <AppShell>
        <RouteError {...props} />
      </AppShell>
    </ErrorBoundary>
  )
}
