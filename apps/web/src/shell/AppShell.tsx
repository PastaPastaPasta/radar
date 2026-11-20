import { t } from '@lingui/core/macro'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary } from '@/app/error-boundary'
import { GlobalMounts } from '@/app/global-mounts'
import { NetworkGate } from '@/app/network-context'
import { useLiveTip } from '@/app/live-tip'
import { UnitsMount } from '@/app/units-mount'
import { useRenderedNetworkSync } from '@/app/rendered-network'
import { CommandPalette, CommandPaletteProvider } from '@/features/search'
import { I18nProvider, i18n, useLocale } from '@/i18n'
import { SectionNav } from './SectionNav'
import { ShellBar } from './ShellBar'
import { SourceModeMark } from './SourceModeMark'
import { ShellFooter } from './ShellFooter'
import { ShortcutsProvider } from './shortcuts'
import { useSpaLinks } from './spa-links'
import { TestnetKeyline } from './TestnetKeyline'

function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [message, setMessage] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setMessage(document.title), 100)
    return () => clearTimeout(id)
  }, [pathname])
  return (
    <p id="route-announcer" aria-live="polite" className="sr-only">
      {message}
    </p>
  )
}

/** The frame of every page. `children` stands in for the route's page, as for an error the root route caught. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { locale } = useLocale()
  useSpaLinks()
  useRenderedNetworkSync()
  useLiveTip()
  return (
    <I18nProvider i18n={i18n}>
      <UnitsMount>
        <CommandPaletteProvider>
          <ShortcutsProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-[var(--dh-surface,Canvas)] focus:px-3 focus:py-2"
            >
              {t`Skip to content`}
            </a>
            <TestnetKeyline />
            <ShellBar />
            <SourceModeMark place="strip" />
            <RouteAnnouncer />
            <main key={locale} id="main" tabIndex={-1} className="dh-container min-h-[60vh] py-6">
              <SectionNav />
              <ErrorBoundary>
                <NetworkGate>{children ?? <Outlet />}</NetworkGate>
              </ErrorBoundary>
            </main>
            <ShellFooter />
            <ErrorBoundary fallback={() => null}>
              <CommandPalette />
            </ErrorBoundary>
            <GlobalMounts />
          </ShortcutsProvider>
        </CommandPaletteProvider>
      </UnitsMount>
    </I18nProvider>
  )
}
