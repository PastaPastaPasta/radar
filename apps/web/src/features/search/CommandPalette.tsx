import { useNavigate } from '@tanstack/react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Command } from 'cmdk'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ENTITY_LABELS, SECTION_LABELS, useNetwork } from '@/features/entity'
import { Badge } from '@/ui/base'
import { classify } from './classify'
import { describeInput, secretNotice } from './describe'
import { GROUP_LABELS, groupHits } from './groups'
import { matchPages } from './pages'
import { useCommandPalette } from './palette-context'
import { useSearch } from './useSearch'
import type { SearchHit } from './types'

const SEARCH_ALL = '__search-all'

function decide(hits: SearchHit[]): SearchHit | undefined {
  const exact = hits.filter((h) => h.rank >= 100)
  return exact.length === 1 ? exact[0] : undefined
}

export function CommandPalette() {
  const palette = useCommandPalette()
  return (
    <Dialog.Root
      open={palette.isOpen}
      onOpenChange={(next) => {
        if (!next) palette.close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay data-palette-overlay className="fixed inset-0 z-[100] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-palette
          className="fixed top-[10vh] left-1/2 z-[101] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border bg-[var(--dh-surface,Canvas)] text-[var(--dh-ink,CanvasText)] shadow-xl"
        >
          <VisuallyHidden>
            <Dialog.Title>Search Radar</Dialog.Title>
          </VisuallyHidden>
          <PaletteBody initialQuery={palette.initialQuery} onDone={() => palette.close()} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody({ initialQuery, onDone }: { initialQuery: string; onDone: () => void }) {
  const navigate = useNavigate()
  const net = useNetwork()
  const [query, setQuery] = useState(initialQuery)
  const [selected, setSelected] = useState('')
  const arrowed = useRef(false)
  const { hits, pending, failed, classified } = useSearch(query, { mode: 'palette' })
  const pages = matchPages(query)
  const trimmed = query.trim()
  const secret = useMemo(() => classify(trimmed, net).warning, [trimmed, net])

  useEffect(() => {
    arrowed.current = false
  }, [query])

  const go = (href: SearchHit['href']) => {
    onDone()
    void navigate(href)
  }
  const openSearchPage = () => {
    onDone()
    void navigate({ to: '/search', search: { q: trimmed } })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      arrowed.current = true
      return
    }
    if (e.key !== 'Enter' || arrowed.current || e.nativeEvent.isComposing) return
    if (trimmed.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    if (secret) return
    const only = classified.raw.trim() === trimmed ? decide(hits) : undefined
    if (only) go(only.href)
    else openSearchPage()
  }

  const groups = groupHits(hits)
  const description = describeInput(classified)

  return (
    <Command
      label="Search Radar"
      shouldFilter={false}
      loop
      vimBindings={false}
      value={selected}
      onValueChange={setSelected}
      onKeyDownCapture={onKeyDown}
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search blocks, transactions, masternodes, names…"
        aria-label="Search Radar"
        className="w-full border-b bg-transparent px-4 py-3 text-base outline-none"
      />
      <div className="empty:hidden">
        {secret ? (
          <p role="status" className="px-2 py-3 text-sm">
            {secretNotice(secret).title}. Radar never sends it anywhere.
          </p>
        ) : null}
        {!secret && trimmed.length > 0 && description.length > 0 ? (
          <p data-classified className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            Looks like {description.join(' · ')}
          </p>
        ) : null}

        {pending.length > 0 ? (
          <p role="status" className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            Searching…
          </p>
        ) : null}

        {failed.length > 0 ? (
          <p role="status" className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            Some sources didn’t answer: {failed.map((f) => f.id).join(', ')}.
          </p>
        ) : null}
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {groups.map(([group, items]) => (
          <Command.Group key={group} heading={GROUP_LABELS[group]}>
            {items.map((hit) => (
              <Command.Item
                key={`${hit.kind}:${hit.id}`}
                value={`${hit.kind}:${hit.id}`}
                onSelect={() => go(hit.href)}
                className="flex items-center justify-between gap-3 rounded px-2 py-2 data-[selected=true]:bg-black/5"
              >
                <span className="min-w-0">
                  <span className="block truncate">{hit.title}</span>
                  {hit.subtitle ? (
                    <span className="block truncate text-xs text-[var(--dh-ink-2,inherit)]">
                      {hit.subtitle}
                    </span>
                  ) : null}
                </span>
                <Badge size="sm">{ENTITY_LABELS[hit.kind]}</Badge>
              </Command.Item>
            ))}
          </Command.Group>
        ))}

        {pages.length > 0 ? (
          <Command.Group heading={trimmed.length === 0 ? 'Go to' : 'Pages'}>
            {pages.map((p) => (
              <Command.Item
                key={p.path}
                value={`page:${p.path}`}
                onSelect={() => go({ to: p.path as '/' })}
                className="flex items-center justify-between gap-3 rounded px-2 py-2 data-[selected=true]:bg-black/5"
              >
                <span>{p.title}</span>
                <span className="text-xs text-[var(--dh-ink-2,inherit)]">
                  {SECTION_LABELS[p.section]}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {trimmed.length > 0 && !secret ? (
          <Command.Group>
            <Command.Item
              value={SEARCH_ALL}
              onSelect={openSearchPage}
              className="rounded px-2 py-2 data-[selected=true]:bg-black/5"
            >
              See all results for “{trimmed}”{net === 'mainnet' ? '' : ` on ${net}`}
            </Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  )
}
