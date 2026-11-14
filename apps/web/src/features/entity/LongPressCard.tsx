import * as Popover from '@radix-ui/react-popover'
import {
  createElement,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { layerAttr } from '@/ui/cx'
import { useHoverCard } from '@/ui/hover-cards'
import { KIND_META } from '@/ui/kinds'
import type { EntityKind } from '@/ui/types'

/** How long a finger rests on a chip before its card opens, and how far it may drift meanwhile. */
const HOLD_MS = 450
const SLOP_PX = 10

interface Measurable {
  getBoundingClientRect(): DOMRect
}

/**
 * Gives a chip on a touch screen the card a mouse gets by hovering: a long press opens it, a tap outside closes it, and
 * the tap that opens the page stays a tap. The finger lifting focuses the chip, which must not count as leaving the card. Focus never opens it here, so a chip that regains focus after going back
 * leaves nothing over its neighbours.
 */
export function LongPressCard({
  kind,
  id,
  children,
}: {
  kind: EntityKind
  id: string
  children: ReactNode
}) {
  const Card = useHoverCard(kind)
  const [open, setOpen] = useState(false)
  const anchor = useRef<Measurable | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | undefined>(undefined)
  const pressed = useRef(false)

  if (!Card) return children

  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    origin.current = undefined
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const chip = e.pointerType === 'touch' ? (e.target as Element).closest('.rx-chip') : null
    if (!chip) return
    pressed.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => {
      pressed.current = true
      const box = chip.closest('.rx-chipwrap') ?? chip
      anchor.current = { getBoundingClientRect: () => box.getBoundingClientRect() }
      timer.current = undefined
      setOpen(true)
    }, HOLD_MS)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const from = origin.current
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP_PX) cancel()
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor virtualRef={anchor} />
      <span
        style={{ display: 'contents' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          if (pressed.current || timer.current !== undefined) e.preventDefault()
        }}
        onClickCapture={(e) => {
          if (!pressed.current) return
          pressed.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {children}
      </span>
      <Popover.Portal>
        <Popover.Content
          className="rx-hc rx-hc--pop"
          data-layer={layerAttr(KIND_META[kind].layer)}
          data-long-press-card={kind}
          sideOffset={8}
          collisionPadding={12}
          align="start"
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {createElement(Card, { id })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
