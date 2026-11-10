import { PageLink } from '@/features/search'
import { DashhqFooter } from './elements'
import { useShortcuts } from './shortcuts'

const LINKS = [
  { to: '/query', label: 'Tools' },
  { to: '/sources', label: 'Data sources' },
  { to: '/status', label: 'Status' },
  { to: '/api', label: 'Radar API' },
  { to: '/saved', label: 'Saved' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
]

export function ShellFooter() {
  const shortcuts = useShortcuts()
  return (
    <DashhqFooter product="radar" source="https://github.com/PastaPastaPasta/radar">
      {LINKS.map((l) => (
        <PageLink key={l.to} to={l.to}>
          {l.label}
        </PageLink>
      ))}{' '}
      <button type="button" onClick={() => shortcuts.open()}>
        Keyboard shortcuts
      </button>
    </DashhqFooter>
  )
}
