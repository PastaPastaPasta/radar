import { t } from '@lingui/core/macro'
import { Link, useNavigate } from '@tanstack/react-router'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { SourceId } from '@/data/envelope'
import {
  getSourceModeState,
  subscribeSourceMode,
  writeSourceMode,
  type SourceMode,
  type SourceModeState,
} from '@/lib/source-mode'
import { cx } from './cx'
import { Icon } from './icon'

export function useSourceMode(): SourceModeState {
  return useSyncExternalStore(subscribeSourceMode, getSourceModeState, getSourceModeState)
}

/** Remembers the choice, and drops `sources=` from the address: a link that turned the mode on would keep it on. */
export function useSetSourceMode(): (mode: SourceMode) => void {
  const navigate = useNavigate()
  return (mode) => {
    writeSourceMode(mode)
    void navigate({
      to: '.',
      search: (s) => ({ ...s, sources: undefined }),
      hash: true,
      replace: true,
      resetScroll: false,
    })
  }
}

/** What a hosted source would have answered, for an unavailable state that names no figures of its own. */
function needs(source: SourceId | undefined): string {
  switch (source) {
    case 'radar':
      return t`This needs Radar's crawler`
    case 'pe':
      return t`This needs Platform Explorer`
    case 'rate':
      return t`USD prices need a price feed`
    default:
      return t`This needs an indexer`
  }
}

export interface UnavailableProps {
  /** What is missing and what it needs: "Balance and history need an indexer". Defaults to a sentence for `source`. */
  title?: ReactNode
  /** The hosted source the section reads. */
  source?: SourceId
  /** One row, for a section inside a page that otherwise has data. */
  compact?: boolean
}

/**
 * What a section shows while Decentralized only mode keeps its source off: what is missing, why, and the way back to
 * all sources. It is not an error: nothing was asked and nothing failed.
 */
export function Unavailable({ title, source, compact = false }: UnavailableProps) {
  const setMode = useSetSourceMode()
  const why = t`Decentralized only mode reads only DAPI nodes and the Platform SDK.`
  const off = (
    <button
      type="button"
      className="dh-btn dh-btn--sm"
      data-sources-all
      onClick={() => {
        setMode('all')
      }}
    >
      {t`Use all sources`}
    </button>
  )
  if (compact) {
    return (
      <div className="rx-unavail rx-unavail--row" data-unavailable="mode" data-compact="1">
        <Icon name="shield" />
        <span title={why}>{title ?? needs(source)}</span>
        {off}
      </div>
    )
  }
  return (
    <div className={cx('rx-empty', 'rx-unavail')} data-unavailable="mode">
      <span className="rx-empty__tile">
        <Icon name="shield" />
      </span>
      <p className="rx-empty__t">{title ?? needs(source)}</p>
      <p className="rx-empty__b">{why}</p>
      <p className="rx-unavail__act">
        {off}
        <Link to="/sources">{t`About sources`}</Link>
      </p>
    </div>
  )
}
