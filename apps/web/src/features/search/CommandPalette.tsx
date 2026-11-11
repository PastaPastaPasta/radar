import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Command } from 'cmdk'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ENTITY_LABELS, SECTION_LABELS, useNetwork } from '@/features/entity'
import { Badge } from '@/ui/base'
import { classify, type Classified } from './classify'
import { describeInput, secretNotice } from './describe'
import { groupHits, groupLabel } from './groups'
import { matchPages } from './pages'
import { useCommandPalette } from './palette-context'
import { useSearch } from './useSearch'
import { useWordlistLoaded } from './wordlist'
import type { SearchHit } from './types'

const SEARCH_ALL = '__search-all'

/** How long Enter waits for resolvers that need the network once the local ones have answered. */
export const ENTER_GRACE_MS = 300

/** The hit Enter opens: the best exact one, or the Core block for a typed height. */
function decide(hits: SearchHit[], classified: Classified): SearchHit | undefined {
  const [best] = hits
  if (best && best.rank >= 100) return best
  if (classified.classes.includes('int')) return hits.find((h) => h.kind === 'block')
  return undefined
}

export function CommandPalette() {
  const { t } = useLingui()
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
            <Dialog.Title>{t`Search Radar`}</Dialog.Title>
          </VisuallyHidden>
          <PaletteBody initialQuery={palette.initialQuery} onDone={() => palette.close()} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteHit({
  hit,
  badge,
  guess = false,
  onSelect,
}: {
  hit: SearchHit
  badge: string
  guess?: boolean
  onSelect: (href: SearchHit['href']) => void
}) {
  return (
    <Command.Item
      value={`${hit.kind}:${hit.id}`}
      onSelect={() => onSelect(hit.href)}
      className={`flex items-center justify-between gap-3 rounded ${guess ? 'border border-dashed ' : ''}px-2 py-2 data-[selected=true]:bg-black/5`}
    >
      <span className="min-w-0">
        <span className="block truncate">{hit.title}</span>
        {hit.subtitle ? (
          <span className="block truncate text-xs text-[var(--dh-ink-2,inherit)]">
            {hit.subtitle}
          </span>
        ) : null}
      </span>
      <Badge size="sm">{badge}</Badge>
    </Command.Item>
  )
}

function PaletteBody({ initialQuery, onDone }: { initialQuery: string; onDone: () => void }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const net = useNetwork()
  const [query, setQuery] = useState(initialQuery)
  const [selected, setSelected] = useState('')
  const arrowed = useRef(false)
  const { hits, pending, pendingLocal, failed, classified } = useSearch(query, { mode: 'palette' })
  const pages = matchPages(query)
  const trimmed = query.trim()
  const wordsReady = useWordlistLoaded()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the wordlist arriving changes the answer
  const secret = useMemo(() => classify(trimmed, net).warning, [trimmed, net, wordsReady])

  // What Enter was pressed on, so typing on or arrowing away cancels it without any reset.
  const [submittedFor, setSubmittedFor] = useState<string | null>(null)
  const [graceOverFor, setGraceOverFor] = useState<string | null>(null)
  const submitted = submittedFor === trimmed
  const graceOver = graceOverFor === trimmed
  const caughtUp = classified.raw.trim() === trimmed

  useEffect(() => {
    arrowed.current = false
  }, [query])

  useEffect(() => {
    if (!submitted || !caughtUp) return
    const id = setTimeout(() => setGraceOverFor(trimmed), ENTER_GRACE_MS)
    return () => clearTimeout(id)
  }, [submitted, caughtUp, trimmed])

  const finished = useRef(false)
  const go = (href: SearchHit['href']) => {
    if (finished.current) return
    finished.current = true
    onDone()
    void navigate(href)
  }
  const openSearchPage = () => go({ to: '/search', search: { q: trimmed } })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      arrowed.current = true
      setSubmittedFor(null)
      return
    }
    if (e.key !== 'Enter' || arrowed.current || e.nativeEvent.isComposing) return
    if (trimmed.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    if (!secret) setSubmittedFor(trimmed)
  }

  useEffect(() => {
    if (!submitted || !caughtUp || pendingLocal.length > 0) return
    if (pending.length > 0 && !graceOver) return
    const target = decide(hits, classified)
    if (target) go(target.href)
    else openSearchPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigation helpers are recreated each render
  }, [submitted, caughtUp, pending.length, pendingLocal.length, graceOver, hits, classified])

  const { groups, guesses } = groupHits(hits)
  const description = describeInput(classified)

  return (
    <Command
      label={t`Search Radar`}
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
        placeholder={t`Search blocks, transactions, masternodes, names…`}
        aria-label={t`Search Radar`}
        className="w-full border-b bg-transparent px-4 py-3 text-base outline-none"
      />
      <div className="empty:hidden">
        {secret ? (
          <p role="status" className="px-2 py-3 text-sm">
            {t`${secretNotice(secret).title}. Radar never sends it anywhere.`}
          </p>
        ) : null}
        {!secret && trimmed.length > 0 && description.length > 0 ? (
          <p data-classified className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            {t`Looks like ${description.join(' · ')}`}
          </p>
        ) : null}

        {pending.length > 0 ? (
          <p role="status" className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            {t`Searching…`}
          </p>
        ) : null}

        {failed.length > 0 ? (
          <p role="status" className="px-2 py-1 text-xs text-[var(--dh-ink-2,inherit)]">
            {t`Some sources didn’t answer: ${failed.map((f) => f.id).join(', ')}.`}
          </p>
        ) : null}
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {groups.map(([group, items]) => (
          <Command.Group key={group} heading={groupLabel(group)}>
            {items.map((hit) => (
              <PaletteHit
                key={`${hit.kind}:${hit.id}`}
                hit={hit}
                badge={ENTITY_LABELS[hit.kind]}
                onSelect={go}
              />
            ))}
          </Command.Group>
        ))}

        {guesses.length > 0 ? (
          <Command.Group heading={t`A guess, not a result`} data-guess>
            {guesses.map((hit) => (
              <PaletteHit
                key={`${hit.kind}:${hit.id}`}
                hit={hit}
                badge={t`Guess`}
                guess
                onSelect={go}
              />
            ))}
          </Command.Group>
        ) : null}

        {pages.length > 0 ? (
          <Command.Group heading={trimmed.length === 0 ? t`Go to` : t`Pages`}>
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
              {net === 'mainnet'
                ? t`See all results for “${trimmed}”`
                : t`See all results for “${trimmed}” on ${net}`}
            </Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  )
}
