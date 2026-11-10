import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { allDevnets, devnetName, useDevnets } from '@/app/devnets'
import {
  PageLink,
  SECTION_ENTRY,
  SearchTrigger,
  findPage,
  sectionOfPath,
  useNetwork,
  type SiteSection,
} from '@/features/search'
import type { NetworkId } from '@/lib/network'
import { DashhqBar, type DashhqNetworkDetail } from './elements'
import { CoreIcon, HomeIcon, NetworkIcon, PlatformIcon, SearchIcon } from './icons'
import { routerLocation } from './spa-links'

interface NavItem {
  section: SiteSection
  label: string
  icon: () => React.JSX.Element
  surface?: 'phone' | 'desktop'
}

const NAV: NavItem[] = [
  { section: 'home', label: 'Home', icon: HomeIcon, surface: 'phone' },
  { section: 'core', label: 'Core', icon: CoreIcon },
  { section: 'network', label: 'Network', icon: NetworkIcon },
  { section: 'platform', label: 'Platform', icon: PlatformIcon },
  { section: 'tools', label: 'Tools', icon: SearchIcon, surface: 'desktop' },
  { section: 'search', label: 'Search', icon: SearchIcon, surface: 'phone' },
]

function networkName(net: NetworkId): string {
  if (net === 'mainnet') return 'Mainnet'
  if (net === 'testnet') return 'Testnet'
  return `Devnet ${devnetName(net)}`
}

export function ShellBar() {
  const net = useNetwork()
  const navigate = useNavigate()
  const devnets = useDevnets()
  const barRef = useRef<HTMLElement>(null)
  const { pathname, routeId } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, routeId: s.matches.at(-1)?.routeId ?? '' }),
  })
  const section = sectionOfPath(pathname)
  const record = findPage(routeId)?.record

  const networks = [
    'mainnet',
    'testnet',
    ...allDevnets(devnets).map((d) => `devnet-${d.name}`),
  ].join(' ')

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const onNetwork = (e: Event) => {
      const detail = (e as CustomEvent<DashhqNetworkDetail>).detail
      const url = new URL(detail.href, location.href)
      e.preventDefault()
      void navigate(routerLocation(url))
    }
    bar.addEventListener('dashhq-network', onNetwork)
    return () => bar.removeEventListener('dashhq-network', onNetwork)
  }, [navigate])

  return (
    <DashhqBar
      ref={barRef}
      product="radar"
      network={net}
      networks={networks}
      phone-nav="tabs"
      network-note={record ? `This ${record} is on ${networkName(net)}.` : undefined}
      sticky
    >
      <nav slot="nav" aria-label="Radar">
        {NAV.map(({ section: s, label, icon: Icon, surface }) => (
          <PageLink
            key={s}
            to={SECTION_ENTRY[s]}
            aria-current={s === section ? 'page' : undefined}
            {...(surface === 'phone' ? { 'data-dh-phone': '' } : {})}
            {...(surface === 'desktop' ? { 'data-dh-desktop': '' } : {})}
          >
            {surface === 'desktop' ? null : <Icon />}
            {label}
          </PageLink>
        ))}
      </nav>
      <div slot="actions">
        <SearchTrigger />
      </div>
    </DashhqBar>
  )
}
