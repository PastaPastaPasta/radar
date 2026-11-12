import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { ProposalPage } from '@/features/core'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/governance/$hash')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, params, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net)) return
    const { proposalPrefetch } = await import('@/data/query/route-prefetch')
    await prefetchForRoute(context.queryClient, net, proposalPrefetch(net, params.hash), {
      preload,
    })
  },
  component: ProposalRoute,
})

function ProposalRoute() {
  const { hash } = Route.useParams()
  return <ProposalPage hash={hash} />
}
