import type { MessageDescriptor } from '@lingui/core'
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
  /** A reading of the input that no source confirmed; shown apart from results and labelled as a guess. */
  speculative?: boolean
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
  /** `index` is a lookup in a hosted index or crawl (Hyphen, Radar): never planned in Decentralized only mode. */
  cost: 'local' | 'index' | 'dapi' | 'sdk'
  /** What the lookup finds, in a few words ("Platform blocks"): the empty state names it when the lookup could not run. */
  what?: MessageDescriptor
  /** Waits while a chain tip is still being read, because the tip decides whether it has anything to ask. */
  waitsForTip?: boolean
  resolve(c: Classified, ctx: ResolverContext): Promise<SearchHit[]>
}

export interface SearchResult {
  /** Best first; equal ranks keep the order of the resolver registry. */
  hits: SearchHit[]
  /** Resolver ids still running. */
  pending: string[]
  /** The pending resolvers that run on the device, which never wait on a network. */
  pendingLocal: string[]
  failed: { id: string; error: SourceError }[]
  /** Index lookups that fit the input and were not run, because Decentralized only mode asks no hosted service. */
  skipped: string[]
  classified: Classified
}

export type SearchMode = 'palette' | 'page'
