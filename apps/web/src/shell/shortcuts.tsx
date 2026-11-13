import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import * as Dialog from '@radix-ui/react-dialog'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isEditableTarget } from '@/features/search'
import { useDevFlags } from '@/features/you/dev-flags'
import type { DevFlags } from '@/features/you/dev-flags'

interface ShortcutsApi {
  open(): void
}

const Context = createContext<ShortcutsApi>({ open: () => undefined })

export function useShortcuts(): ShortcutsApi {
  return useContext(Context)
}

const ROWS: { keys: string[]; does: MessageDescriptor; flag?: keyof DevFlags }[] = [
  { keys: ['/'], does: msg`Search Radar` },
  { keys: ['Ctrl', 'K'], does: msg`Search Radar (⌘K on a Mac)` },
  { keys: ['?'], does: msg`Show these shortcuts` },
  { keys: ['Esc'], does: msg`Close a dialog or the search` },
  { keys: ['↑', '↓'], does: msg`Move through search results` },
  { keys: ['Enter'], does: msg`Open the result, or all results` },
  { keys: ['j', 'k'], does: msg`Move through table rows` },
  { keys: ['Enter'], does: msg`Open the selected table row` },
  { keys: ['Alt', 'Shift', 'P'], does: msg`Open the proof inspector`, flag: 'proofShortcut' },
  {
    keys: ['Alt', 'Shift', 'D'],
    does: msg`Open the diagnostics drawer`,
    flag: 'diagnosticsShortcut',
  },
]

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useLingui()
  const [isOpen, setOpen] = useState(false)
  const devFlags = useDevFlags()
  const open = useCallback(() => setOpen(true), [])
  const api = useMemo(() => ({ open }), [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?' && !isEditableTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Context value={api}>
      {children}
      <Dialog.Root open={isOpen} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-[12vh] left-1/2 z-[101] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border bg-[var(--dh-surface,Canvas)] p-5 text-[var(--dh-ink,CanvasText)] shadow-xl"
          >
            <Dialog.Title className="mb-3 text-lg font-semibold">{t`Keyboard shortcuts`}</Dialog.Title>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
              {ROWS.filter((row) => !row.flag || devFlags[row.flag]).map((row) => (
                <div key={row.keys.join('+') + row.does.id} className="contents">
                  <dt className="flex gap-1">
                    {row.keys.map((k) => (
                      <kbd key={k} className="rounded border px-1.5 text-sm">
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd>{i18n._(row.does)}</dd>
                </div>
              ))}
            </dl>
            <Dialog.Close className="mt-4 rounded border px-3 py-1.5">{t`Close`}</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context>
  )
}
