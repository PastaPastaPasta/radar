import { HoverCardScope } from '../hover-cards'
import { KIT_HOVER_CARDS } from './hover-samples'
import {
  AmountSection,
  BadgeSection,
  ChartSection,
  EntitySection,
  FiguresSection,
  LayoutSection,
  LinkOutSection,
  SourceSection,
  StateSection,
  TokensSection,
} from './sections'
import { PaletteSection, TableSection, TabsSection } from './table-section'

const SECTIONS: [string, string][] = [
  ['tokens', 'Tokens'],
  ['layout', 'Cards'],
  ['figures', 'Figures'],
  ['amount', 'Amount and time'],
  ['entities', 'Entities'],
  ['badges', 'Badges'],
  ['charts', 'Charts'],
  ['sources', 'Sources'],
  ['states', 'States'],
  ['tabs', 'Tabs'],
  ['table', 'DataTable'],
  ['linkouts', 'Link-outs'],
  ['palette', 'Palette'],
]

type ThemePref = 'system' | 'light' | 'dark'

interface ShellTheme {
  set?(pref: ThemePref): void
}

function setTheme(pref: ThemePref) {
  const shell = (window as unknown as { dashhq?: { theme?: ShellTheme } }).dashhq?.theme
  if (shell?.set) {
    shell.set(pref)
    return
  }
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
}

export default function KitContent() {
  return (
    <HoverCardScope cards={KIT_HOVER_CARDS}>
      <KitBody />
    </HoverCardScope>
  )
}

function KitBody() {
  return (
    <main id="main" className="pb-16">
      <section className="rx-plate rx-band" data-layer="network" aria-labelledby="kit-title">
        <div className="dh-container">
          <p className="rx-rec__kicker">Radar design system · every component, every state</p>
          <h1 className="rx-rec__title mt-2" id="kit-title">
            Kit
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="dh-seg" role="group" aria-label="Theme">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTheme(t)
                  }}
                >
                  {t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <nav aria-label="Kit sections" className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="inline-block py-1.5">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </section>
      <div className="dh-container pt-10" data-ready="1">
        <TokensSection />
        <LayoutSection />
        <FiguresSection />
        <AmountSection />
        <EntitySection />
        <BadgeSection />
        <ChartSection />
        <SourceSection />
        <StateSection />
        <TabsSection />
        <TableSection />
        <LinkOutSection />
        <PaletteSection />
      </div>
    </main>
  )
}
