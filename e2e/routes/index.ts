import { int } from './int'
import { m1Routes } from './m1'
import { netA } from './net-a'
import { netB } from './net-b'
import { netC } from './net-c'
import { netD } from './net-d'
import { pBlocks } from './p-blocks'
import { pChain } from './p-chain'
import { pData } from './p-data'
import { pHome } from './p-home'
import { pId } from './p-id'
import { pToken } from './p-token'
import { pVote } from './p-vote'
import { tools } from './tools'
import { uniL } from './uni-l'
import { uniS } from './uni-s'
import { you } from './you'
import type { RouteCase, RouteNet } from './types'

export type { RouteCase, RouteNet } from './types'

export const ROUTE_CASES: RouteCase[] = [
  ...m1Routes,
  ...netA,
  ...netB,
  ...netC,
  ...netD,
  ...pHome,
  ...pChain,
  ...pBlocks,
  ...pId,
  ...pData,
  ...pToken,
  ...pVote,
  ...tools,
  ...you,
  ...uniS,
  ...uniL,
  ...int,
]

/** The networks a case is exercised on. */
export const casesNets = (c: RouteCase): readonly RouteNet[] => c.nets ?? ['mainnet', 'testnet']

/** `path` with extra query parameters appended, in front of any hash. */
export function withQuery(path: string, ...params: string[]): string {
  const extra = params.filter(Boolean).join('&')
  return extra ? `${path}${path.includes('?') ? '&' : '?'}${extra}` : path
}

/** The query parameter that selects a network; mainnet is the default and carries none. */
export const networkQuery = (net: RouteNet): string => (net === 'mainnet' ? '' : `network=${net}`)
