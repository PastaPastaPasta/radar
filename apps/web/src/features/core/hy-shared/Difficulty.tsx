import { formatFull, formatSignificant } from '@/lib/format'

/** A difficulty rounded for reading, with every digit in its title. */
export function Difficulty({ value, significant }: { value: number; significant?: number }) {
  return (
    <span className="rx-num" title={formatFull(value)}>
      {formatSignificant(value, significant)}
    </span>
  )
}
