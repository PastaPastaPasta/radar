import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { NamePage } from '@/features/platform'

export const Route = createFileRoute('/name/$label')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'namePrefetch'),
  component: NamePageRoute,
})

function NamePageRoute() {
  const { label } = Route.useParams()
  return <NamePage label={label} />
}
