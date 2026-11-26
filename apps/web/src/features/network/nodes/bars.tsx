import { Link, type LinkProps } from '@tanstack/react-router'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { useCensusColors } from './census-colors'
import { paintFor } from './census-paint'
import { useShareText } from './parts'

export interface BarPart {
  key: string
  name: string
  n: number
  color: string
  /** Where the legend item leads: the list of the nodes it counts. */
  link?: Pick<LinkProps, 'to' | 'search' | 'hash'>
}

/** Below this width a segment is drawn without the gap that separates it from the one before. */
const SEPARATED_PX = 6
const LABEL_PAD_PX = 24

let measurer: CanvasRenderingContext2D | null | undefined

/** The width a label takes in the bar's font, or undefined where no canvas can tell (tests). */
function textWidth(text: string, font: string): number | undefined {
  if (measurer === undefined) {
    try {
      measurer = document.createElement('canvas').getContext('2d')
    } catch {
      measurer = null
    }
  }
  if (!measurer) return undefined
  measurer.font = font
  return measurer.measureText(text).width
}

/** The track's width and font, read again whenever the track resizes. */
function useTrack() {
  const [el, ref] = useState<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ width: number; font: string }>()
  useLayoutEffect(() => {
    if (!el) return
    const read = () => {
      const font = `600 12.5px ${getComputedStyle(el).fontFamily}`
      setBox((b) =>
        b?.width === el.clientWidth && b.font === font ? b : { width: el.clientWidth, font },
      )
    }
    const remeasure = () => {
      setBox((b) => (b ? { ...b } : b))
    }
    read()
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.addEventListener('loadingdone', remeasure)
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(read)
    ro?.observe(el)
    return () => {
      fonts?.removeEventListener('loadingdone', remeasure)
      ro?.disconnect()
    }
  }, [el])
  return { ref, box }
}

/**
 * One 100 % bar of the parts, as on /v24. A segment wide enough for its name and share shows both, one wide enough for
 * the share shows that, and a narrower one shows nothing rather than a cut label. A legend names every part with its
 * share (and count). The bar is one image with the whole reading as its name.
 */
export function SegBar({
  parts,
  label,
  size = 'md',
  inline = true,
  legend = 'full',
  extra,
}: {
  parts: readonly BarPart[]
  label: string
  size?: 'md' | 'sm'
  /** Labels on the segments themselves. */
  inline?: boolean
  legend?: 'full' | 'share' | 'none'
  extra?: ReactNode
}) {
  const colors = useCensusColors()
  const share = useShareText()
  const { ref, box } = useTrack()
  const sum = parts.reduce((a, p) => a + p.n, 0)
  if (sum === 0) return null
  const shown = parts.filter((p) => p.n > 0)
  const painted = shown.map((p) => {
    const px = box ? (p.n / sum) * box.width : undefined
    const pct = share(p.n, sum)
    let text: 'both' | 'share' | undefined
    if (box && px !== undefined && inline && size === 'md') {
      const fits = (label: string): boolean => {
        const w = textWidth(label, box.font)
        return w !== undefined && w + LABEL_PAD_PX <= px
      }
      if (fits(`${p.name} ${pct}`)) text = 'both'
      else if (fits(pct)) text = 'share'
    }
    return {
      ...p,
      pct,
      text,
      separated: px === undefined || px >= SEPARATED_PX,
      paint: paintFor(p.color, colors.ink, colors.surface),
    }
  })
  return (
    <figure className="rx-nbar" data-nbar data-sharebar>
      <div
        ref={ref}
        className={`rx-nbar__track rx-nbar__track--${size}`}
        role="img"
        aria-label={`${label}: ${painted.map((p) => `${p.name} ${p.pct}`).join(', ')}`}
      >
        {painted.map((p, i) => (
          <span
            key={p.key}
            style={{ flexGrow: p.n, background: p.paint.background, color: p.paint.color }}
            title={`${p.name}: ${formatInt(p.n)} (${p.pct})`}
            data-part={p.key}
            data-sep={i > 0 && p.separated ? '' : undefined}
          >
            {p.text ? (
              <span className="rx-nbar__seg" aria-hidden="true">
                {p.text === 'both' ? <span>{p.name}</span> : null}
                <span>{p.pct}</span>
              </span>
            ) : null}
          </span>
        ))}
      </div>
      {legend !== 'none' || extra ? (
        <ul className="rx-legend rx-nbar__legend">
          {legend === 'none'
            ? null
            : painted.map((p) => {
                const body = (
                  <>
                    <span className="rx-sw" style={{ background: p.paint.background }} />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{p.name}</span>{' '}
                    <b>{p.pct}</b>
                    {legend === 'full' ? (
                      <span className="tabular-nums">{formatInt(p.n)}</span>
                    ) : null}
                  </>
                )
                return (
                  <li key={p.key} data-legend={p.key}>
                    {p.link ? (
                      <Link {...p.link} className="rx-nbar__link">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
          {extra ? <li className="rx-nbar__extra">{extra}</li> : null}
        </ul>
      ) : null}
    </figure>
  )
}

/** The answer a section gives first: a pill (a status in its colour, or a plain count) and, beside it, one short line. */
export function Answer({
  pill,
  tone,
  children,
  ...rest
}: {
  pill: ReactNode
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  children?: ReactNode
} & Record<`data-${string}`, string | undefined>) {
  const pillTone = tone === 'neutral' ? 'rx-nanswer__count' : `dh-pill--dot dh-pill--${tone}`
  return (
    <div className="rx-v24-answer rx-nanswer" {...rest}>
      <span className={`dh-pill rx-v24-verdict ${pillTone}`}>{pill}</span>
      {children}
    </div>
  )
}

/** good from 98 %, warn from 90 %, bad below: the rule the home's "masternodes answering" figure uses. */
export function shareTone(share: number): 'good' | 'warn' | 'bad' {
  if (share >= 0.98) return 'good'
  if (share >= 0.9) return 'warn'
  return 'bad'
}
