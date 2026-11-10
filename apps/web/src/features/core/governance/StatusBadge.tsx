import { useLingui } from '@lingui/react/macro'
import { Badge } from '@/ui'
import type { ProposalStatus } from './status'

export function StatusBadge({ status }: { status: ProposalStatus }) {
  const { t } = useLingui()
  switch (status) {
    case 'funded':
      return <Badge tone="success">{t`Funded`}</Badge>
    case 'passing':
      return <Badge tone="info">{t`Passing`}</Badge>
    case 'failing':
      return <Badge tone="warning">{t`Not passing`}</Badge>
    case 'ended':
      return <Badge>{t`Ended`}</Badge>
    case 'invalid':
      return <Badge tone="danger">{t`Invalid`}</Badge>
  }
}
