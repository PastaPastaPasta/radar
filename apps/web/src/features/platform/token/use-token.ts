import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { wellKnownTokens } from '@/lib/well-known'
import {
  decimalsOf,
  localizationsOf,
  pickLocalization,
  tokenConfigOf,
  type Localization,
} from './token-config'

/**
 * What the contract and the node say about one token: where it comes from (`tokens.contractInfo`), its configuration
 * (the contract's token at that position), and the names and decimals read from it.
 */
export function useToken(id: string) {
  const net = useNetwork()
  const { i18n } = useLingui()
  const valid = isPlatformId(id)
  const info = useQuery({
    ...sdkQueries['tokens.contractInfo'](net, { tokenId: id }),
    enabled: valid,
  })
  const origin = info.data?.data ?? undefined
  const contract = useQuery({
    ...sdkQueries['contracts.fetch'](net, { id: origin?.contractId ?? '' }),
    enabled: origin !== undefined,
  })
  const known = wellKnownTokens(net).find((k) => k.id === id)
  const found = contract.data?.data ?? undefined
  const config = found && origin ? tokenConfigOf(found, origin.position) : undefined
  const localizations = config ? localizationsOf(config) : {}
  const name: Localization | undefined = pickLocalization(localizations, i18n.locale)
  const decimals = (config ? decimalsOf(config) : undefined) ?? known?.decimals
  const stamps: SourceStamp[] = [
    ...(info.data ? [stampOf(info.data)] : []),
    ...(contract.data ? [stampOf(contract.data)] : []),
  ]
  return {
    id,
    net,
    valid,
    info,
    contract,
    origin,
    config,
    localizations,
    name,
    decimals,
    symbol: known?.symbol ?? name?.singular,
    /** True once the node has answered that no token has this ID. */
    missing: valid && info.data?.data === null,
    stamps,
  }
}

export type TokenView = ReturnType<typeof useToken>

/** How `Amount` draws a token's base units; undecided until the decimals are known. */
export function tokenAmountKind(token: TokenView) {
  return token.decimals === undefined
    ? undefined
    : ({ token: { decimals: token.decimals, symbol: token.symbol } } as const)
}
