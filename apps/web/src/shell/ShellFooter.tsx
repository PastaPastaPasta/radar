import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { LanguageSelect } from '@/i18n/LanguageSelect'
import { PageLink } from '@/features/search'
import { DashhqFooter } from './elements'
import { RateNote } from './RateNote'
import { useShortcuts } from './shortcuts'

const LINKS = [
  { to: '/query', label: msg`Tools` },
  { to: '/sources', label: msg`Data sources` },
  { to: '/status', label: msg`Status` },
  { to: '/api', label: msg`Radar API` },
  { to: '/saved', label: msg`Saved` },
  { to: '/settings', label: msg`Settings` },
  { to: '/about', label: msg`About` },
]

export function ShellFooter() {
  const { t, i18n } = useLingui()
  const shortcuts = useShortcuts()
  return (
    <DashhqFooter product="radar" source="https://github.com/PastaPastaPasta/radar">
      <RateNote />
      {LINKS.map((l) => (
        <PageLink key={l.to} to={l.to}>
          {i18n._(l.label)}
        </PageLink>
      ))}{' '}
      <button type="button" onClick={() => shortcuts.open()}>
        {t`Keyboard shortcuts`}
      </button>{' '}
      <LanguageSelect label={t`Language`} className="dh-select dh-select--sm" />
    </DashhqFooter>
  )
}
