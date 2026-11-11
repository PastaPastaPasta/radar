import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { LanguageSelect } from '@/i18n/LanguageSelect'
import { PageLink } from '@/features/search'
import { Icon } from '@/ui'
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
      <div className="rx-foot">
        <div className="rx-foot__links">
          {LINKS.map((l) => (
            <PageLink key={l.to} to={l.to}>
              {i18n._(l.label)}
            </PageLink>
          ))}
        </div>
        <div className="rx-foot__tools">
          <button type="button" onClick={() => shortcuts.open()}>
            {t`Keyboard shortcuts`}
          </button>
          <span className="rx-foot__lang">
            <Icon name="globe" size="sm" />
            <LanguageSelect label={t`Language`} />
            <Icon name="chevron" size="sm" />
          </span>
        </div>
      </div>
    </DashhqFooter>
  )
}
