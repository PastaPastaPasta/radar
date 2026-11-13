import * as Dialog from '@radix-ui/react-dialog'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { Icon } from '@/ui'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** A short line under the title. */
  description?: ReactNode
  children: ReactNode
  /** Controls beside the close button. */
  actions?: ReactNode
  testId: string
}

/** A side sheet on a desktop and a bottom sheet on a phone; Esc and the scrim close it. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  testId,
}: SheetProps) {
  const { t } = useLingui()
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="rx-scrim" />
        <Dialog.Content
          data-sheet={testId}
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] flex-col rounded-t-xl border-t border-[var(--dh-line)] bg-[var(--dh-surface)] text-[var(--dh-ink)] shadow-2xl outline-none md:inset-x-auto md:inset-y-0 md:right-0 md:bottom-auto md:max-h-none md:w-[min(42rem,100vw)] md:rounded-none md:border-t-0 md:border-l"
        >
          <header className="flex items-start gap-3 border-b border-[var(--dh-line)] p-4">
            <div className="grid min-w-0 flex-1 gap-1">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <p className="text-[var(--dh-ink-2)]">{description}</p> : null}
            </div>
            {actions}
            <Dialog.Close className="dh-btn dh-btn--quiet dh-btn--sm" aria-label={t`Close`}>
              <Icon name="x" size="sm" />
            </Dialog.Close>
          </header>
          <div className="grid gap-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
