import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { sdkQueries } from '@/data/sdk/queries'
import { formatInt } from '@/lib/format'
import { systemContract } from '@/lib/well-known'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading } from './frame'
import { OwnerChip, usePeOn } from './parts'

export function ContestHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const label = id.replace(/\.dash$/i, '')
  const indexValues = ['dash', label]
  const state = useQuery(
    sdkQueries['voting.contestedResourceVoteState'](net, {
      contractId: systemContract('dpns').id,
      type: 'domain',
      index: 'parentNameAndLabel',
      indexValues,
    }),
  )
  const peOn = usePeOn(net)
  const pe = useQuery({ ...peQueries.contestedResource(net, indexValues), enabled: peOn })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="vote" />,
    kind: t`Contested name`,
    href: entityHref('contest', id, net),
  } as const
  const title = `${label}.dash`

  if (state.isPending) return <CardLoading />
  if (state.isError) return <ErrorState error={state.error} source="sdk" compact />
  const { contenders, winner } = state.data.data
  const ranked = [...contenders].sort((a, b) => (b.voteTally ?? 0) - (a.voteTally ?? 0))
  const leader = ranked[0]
  const ends = pe.data?.data?.endTimestamp
  const status =
    winner?.kind === 'won'
      ? t`Won`
      : winner?.kind === 'locked'
        ? t`Locked`
        : winner
          ? t`Finished`
          : contenders.length > 0
            ? t`Active`
            : undefined
  if (status === undefined) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No contest for this name on this network.` }]}
        source={stampOf(state.data)}
      />
    )
  }
  const leading = winner?.kind === 'won' ? winner.identityId : leader?.identityId
  const stamps = pe.data ? [stampOf(state.data), stampOf(pe.data)] : stampOf(state.data)
  return (
    <div data-hover-card="contest">
      <HoverCardLayout
        {...common}
        title={title}
        rows={[
          {
            label: t`Status`,
            value: (
              <Badge tone={winner ? 'neutral' : 'info'} size="sm">
                {status}
              </Badge>
            ),
          },
          ...(ends ? [{ label: t`Ends`, value: <Time ms={ends} mode="both" /> }] : []),
          ...(leading
            ? [
                {
                  label: winner?.kind === 'won' ? t`Winner` : t`Leading`,
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <OwnerChip id={leading} />
                      {!winner && leader?.voteTally != null
                        ? t`${formatInt(leader.voteTally)} votes`
                        : null}
                    </span>
                  ),
                },
              ]
            : []),
          { label: t`Contenders`, value: formatInt(contenders.length) },
        ]}
        source={stamps}
      />
    </div>
  )
}
