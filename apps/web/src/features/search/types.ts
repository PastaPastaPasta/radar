import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { SourceError } from '@/data/errors'
import type { NetworkId } from '@/lib/network'
import type { EntityKind } from '@/ui'
import type { Classified, InputClass, Tip } from './classify'

export interface SearchHit {
  kind: EntityKind
  id: string
  title: ReactNode
  subtitle?: ReactNode
  href: LinkProps
  stamp: SourceStamp
  /** 100 exact by ID or hash, 80 exact name, 50 prefix, 20 text. */
  rank: number
}

export interface ResolverContext {
  net: NetworkId
  signal: AbortSignal
  tip?: Tip
}

export interface Resolver {
  /** 'dapi-block', 'dapi-tx', 'pe-search', 'hy-search', 'sdk-identity', 'mn-join', 'dpns-prefix', … */
  id: string
  accepts: InputClass[]
  cost: 'local' | 'index' | 'dapi' | 'sdk'
  resolve(c: Classified, ctx: ResolverContext): Promise<SearchHit[]>
}

export interface SearchResult {
  hits: SearchHit[]
  /** Resolver ids still running. */
  pending: string[]
  failed: { id: string; error: SourceError }[]
  classified: Classified
}

export type SearchMode = 'palette' | 'page'
