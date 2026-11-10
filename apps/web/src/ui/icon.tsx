import { cx } from './cx'
import { ICON_PATHS, type IconName } from './icon-paths'

export type { IconName }

export interface IconProps {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Icon({ name, size = 'md', className }: IconProps) {
  return (
    <svg
      className={cx(
        'rx-ico',
        size === 'sm' && 'rx-ico--sm',
        size === 'lg' && 'rx-ico--lg',
        className,
      )}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}
