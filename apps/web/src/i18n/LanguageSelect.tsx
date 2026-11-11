import { useId } from 'react'
import { AVAILABLE_LOCALES, useLocale } from './index'

/** The language menu, each language in its own script. Give `label` when no visible <label> names it. */
export function LanguageSelect({
  label,
  id,
  className,
}: {
  label?: string
  id?: string
  className?: string
}) {
  const generated = useId()
  const { locale, setLocale } = useLocale()
  return (
    <select
      id={id ?? generated}
      aria-label={label}
      className={className ?? 'dh-select'}
      value={locale}
      onChange={(e) => void setLocale(e.target.value)}
    >
      {AVAILABLE_LOCALES.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  )
}
