import { Link, type LinkProps } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

type AnchorProps = Omit<ComponentProps<'a'>, 'href'>

export interface PageLinkProps extends AnchorProps {
  /** A route path without params, from the site map. */
  to: string
  search?: Record<string, string | undefined>
  hash?: string
  replace?: boolean
  preload?: LinkProps['preload']
}

/** A router link for paths known only as strings (site map, nav tables). `network` is retained by the root route. */
export function PageLink({ to, search, hash, replace, preload, ...rest }: PageLinkProps) {
  return (
    <Link
      to={to as '/'}
      search={search as never}
      hash={hash}
      replace={replace}
      preload={preload}
      {...rest}
    />
  )
}
