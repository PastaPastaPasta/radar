import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { allDevnets, useDevnets } from '@/app/devnets'
import {
  HeaderTip,
  PageLink,
  SECTION_ENTRY,
  SearchTrigger,
  findPage,
  recordLabel,
  sectionOfPath,
  useNetwork,
  type SiteSection,
} from '@/features/search'
import { networkName } from '@/ui/base'
import { adoptBarOverlay } from './bar-overlay'
import { DashhqBar, type DashhqNetworkDetail } from './elements'
import { CoreIcon, HomeIcon, NetworkIcon, PlatformIcon, SearchIcon } from './icons'
import { SourceModeMark } from './SourceModeMark'
import { switchTarget } from './network-switch'
import { routerLocation } from './spa-links'
import { UnitSwitch } from './UnitSwitch'

interface NavItem {
  section: SiteSection
  label: MessageDescriptor
  icon: () => React.JSX.Element
  surface?: 'phone' | 'desktop'
}

const NAV: NavItem[] = [
  { section: 'home', label: msg`Home`, icon: HomeIcon, surface: 'phone' },
  { section: 'core', label: msg`Core`, icon: CoreIcon },
  { section: 'network', label: msg`Network`, icon: NetworkIcon },
  { section: 'platform', label: msg`Platform`, icon: PlatformIcon },
  { section: 'tools', label: msg`Tools`, icon: SearchIcon, surface: 'desktop' },
  { section: 'search', label: msg`Search`, icon: SearchIcon, surface: 'phone' },
]

export function ShellBar() {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const router = useRouter()
  const devnets = useDevnets()
  const barRef = useRef<HTMLElement>(null)
  const { pathname, routeId } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, routeId: s.matches.at(-1)?.routeId ?? '' }),
  })
  const section = sectionOfPath(pathname)
  const page = findPage(routeId)
  const record = page && recordLabel(page)

  const network = networkName(net)
  const networks = [
    'mainnet',
    'testnet',
    ...allDevnets(devnets).map((d) => `devnet-${d.name}`),
  ].join(' ')

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    let live = true
    void customElements.whenDefined('dashhq-bar').then(() => {
      if (live) adoptBarOverlay(bar)
    })
    const onNetwork = (e: Event) => {
      const detail = (e as CustomEvent<DashhqNetworkDetail>).detail
      const proposed = new URL(detail.href, location.href)
      const last = router.state.matches.at(-1)
      const { url } = last
        ? switchTarget(proposed, {
            routeId: last.routeId,
            params: last.params,
          })
        : { url: proposed }
      e.preventDefault()
      void navigate(routerLocation(url))
    }
    bar.addEventListener('dashhq-network', onNetwork)
    return () => {
      live = false
      bar.removeEventListener('dashhq-network', onNetwork)
    }
  }, [navigate, router])

  return (
    <DashhqBar
      ref={barRef}
      product="radar"
      network={net}
      networks={networks}
      phone-nav="tabs"
      network-note={record ? t`This ${record} is on ${network}.` : undefined}
      sticky
    >
      <nav slot="nav" aria-label={t`Radar`}>
        {NAV.map(({ section: s, label, icon: Icon, surface }) => (
          <PageLink
            key={s}
            to={SECTION_ENTRY[s]}
            aria-current={s === section ? 'page' : undefined}
            {...(surface === 'phone' ? { 'data-dh-phone': '' } : {})}
            {...(surface === 'desktop' ? { 'data-dh-desktop': '' } : {})}
          >
            {surface === 'desktop' ? null : <Icon />}
            {i18n._(label)}
          </PageLink>
        ))}
      </nav>
      <div slot="actions">
        <SourceModeMark place="bar" />
        <UnitSwitch className="rx-unit--bar" />
        <HeaderTip />
        <SearchTrigger className="rx-hdr-search" />
      </div>
    </DashhqBar>
  )
}
