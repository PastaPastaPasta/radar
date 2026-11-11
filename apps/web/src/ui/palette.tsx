import * as Dialog from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Command } from 'cmdk'
import type { KeyboardEvent, ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { Copy } from './hash'
import { layerAttr } from './cx'
import { Icon } from './icon'
import type { IconName } from './icon-paths'
import { SourceLine } from './states'
import type { Layer } from './types'

export interface PaletteItem {
  id: string
  glyph: ReactNode
  title: ReactNode
  detail?: ReactNode
  /** End slot: "↵", an age, a count. */
  end?: ReactNode
  href?: string
}

export interface PaletteGroup {
  id: string
  heading: string
  icon: IconName
  items: PaletteItem[]
}

export interface PaletteClassifier {
  label: string
  icon: IconName
  layer: Layer
  text: ReactNode
}

export interface PaletteShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  classifier?: PaletteClassifier
  groups: PaletteGroup[]
  selectedId?: string
  onSelectedChange?: (id: string) => void
  onSelect: (item: PaletteItem, newTab: boolean) => void
  preview?: ReactNode
  /** Right side of the foot: the cross-network hint. */
  networkHint?: ReactNode
  /** Shown instead of the list when there are no results. */
  empty?: ReactNode
  loading?: boolean
  placeholder?: string
}

function findItem(groups: PaletteGroup[], id: string | undefined): PaletteItem | undefined {
  for (const g of groups) {
    const hit = g.items.find((i) => i.id === id)
    if (hit) return hit
  }
  return undefined
}

export function PaletteShell({
  open,
  onOpenChange,
  query,
  onQueryChange,
  classifier,
  groups,
  selectedId,
  onSelectedChange,
  onSelect,
  preview,
  networkHint,
  empty,
  loading,
  placeholder = 'Search blocks, transactions, names, identities and masternodes',
}: PaletteShellProps) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !e.shiftKey || !(e.target instanceof HTMLInputElement)) return
    const highlighted = e.target
      .closest('[cmdk-root]')
      ?.querySelector('[cmdk-item][data-selected="true"]')
      ?.getAttribute('data-value')
    const item = findItem(groups, selectedId ?? highlighted ?? undefined)
    if (!item) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(item, true)
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-scrim" />
        <Dialog.Content
          className="rx-pal"
          aria-describedby={undefined}
          onKeyDownCapture={onKeyDownCapture}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>Search Radar</Dialog.Title>
          </VisuallyHidden.Root>
          <Command
            shouldFilter={false}
            loop
            label="Search Radar"
            value={selectedId}
            onValueChange={onSelectedChange}
            className="rx-pal__cmd"
          >
            <div className="rx-pal__input">
              <Icon name="search" />
              <Command.Input
                value={query}
                onValueChange={onQueryChange}
                placeholder={placeholder}
              />
              <kbd className="rx-hide-sm">Esc</kbd>
              <Dialog.Close className="rx-pal__cancel rx-only-sm">Cancel</Dialog.Close>
            </div>
            {classifier ? (
              <div className="rx-pal__class">
                <span className="rx-type" data-layer={layerAttr(classifier.layer)}>
                  <Icon name={classifier.icon} />
                  {classifier.label}
                </span>
                <span>{classifier.text}</span>
              </div>
            ) : null}
            <div className="rx-pal__body">
              <Command.List className="rx-pal__list" aria-busy={loading ? true : undefined}>
                {total === 0 ? (
                  <Command.Empty className="rx-pal__empty">
                    {loading ? 'Searching…' : empty}
                  </Command.Empty>
                ) : null}
                {groups
                  .filter((g) => g.items.length > 0)
                  .map((g) => (
                    <Command.Group
                      key={g.id}
                      heading={
                        <span className="rx-pal__group">
                          <Icon name={g.icon} size="sm" />
                          {g.heading}
                          <span className="n">{g.items.length}</span>
                        </span>
                      }
                    >
                      {g.items.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={item.id}
                          className="rx-opt"
                          onSelect={() => {
                            onSelect(item, false)
                          }}
                        >
                          {item.glyph}
                          <span className="rx-opt__t">{item.title}</span>
                          {item.detail ? <span className="rx-opt__s">{item.detail}</span> : null}
                          {item.end ? <span className="rx-opt__e">{item.end}</span> : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ))}
              </Command.List>
              {preview ? (
                <aside className="rx-pal__prev" aria-label="Preview">
                  {preview}
                </aside>
              ) : null}
            </div>
            <div className="rx-pal__foot">
              <span className="k">
                <kbd>↑</kbd>
                <kbd>↓</kbd> move
              </span>
              <span className="k">
                <kbd>↵</kbd> open
              </span>
              <span className="k">
                <kbd>⇧</kbd>
                <kbd>↵</kbd> new tab
              </span>
              <span className="k">
                <kbd>Esc</kbd> close
              </span>
              {networkHint ? <span className="rx-net">{networkHint}</span> : null}
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface PalettePreviewProps {
  glyph: ReactNode
  title: ReactNode
  badge?: ReactNode
  id?: string
  rows: { label: ReactNode; value: ReactNode }[]
  source?: SourceStamp | SourceStamp[]
  href?: string
  openLabel?: string
}

export function PalettePreview({
  glyph,
  title,
  badge,
  id,
  rows,
  source,
  href,
  openLabel = 'Open',
}: PalettePreviewProps) {
  return (
    <div className="rx-prev">
      <div className="rx-hc__head">
        {glyph}
        <div>
          <div className="rx-hc__title">{title}</div>
          {badge}
        </div>
      </div>
      {id ? <p className="rx-hc__id">{id}</p> : null}
      <dl className="dh-kv">
        {rows.map((r, i) => (
          <div key={i}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="rx-hc__foot">
        {source ? <SourceLine stamp={source} compact /> : null}
        {id ? <Copy value={id} label="Copy ID" /> : null}
        {href ? (
          <a className="rx-go" href={href}>
            {openLabel}
          </a>
        ) : null}
      </div>
    </div>
  )
}
