import { useLingui } from '@lingui/react/macro'
import { useSetSourceMode, useSourceMode } from './source-mode'
import { SegFilter } from './table-tools'

/** The choice between all sources and Decentralized only, with a sentence on what the mode in force reads. */
export function SourceModeSwitch() {
  const { t } = useLingui()
  const { mode } = useSourceMode()
  const setMode = useSetSourceMode()
  return (
    <>
      <SegFilter
        label={t`Sources`}
        value={mode}
        onChange={(next) => {
          setMode(next === 'decentralized' ? 'decentralized' : 'all')
        }}
        options={[
          { id: 'all', label: t`All sources` },
          { id: 'decentralized', label: t`Decentralized only` },
        ]}
      />
      <p data-mode-note className="max-w-2xl text-[var(--dh-ink-2)]">
        {mode === 'decentralized'
          ? t`Radar reads only DAPI nodes and the Platform SDK. A page that needs an indexer, the crawler or a price says so instead of asking one.`
          : t`Radar reads DAPI and the Platform SDK first, and asks hosted services for what they can't answer: address history, the rich list, charts, governance, the node census and USD prices.`}
      </p>
    </>
  )
}
