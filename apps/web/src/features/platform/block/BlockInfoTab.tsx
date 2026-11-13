import { useLingui } from '@lingui/react/macro'
import type { SourceStamp } from '@/data/envelope'
import type { PeBlock } from '@/data/pe/schemas'
import { Card, JsonView } from '@/ui'

/** The block's metadata as Explorer gives it, without the transitions and the member list (both have their tabs). */
export function BlockInfoTab({ block, stamp }: { block: PeBlock; stamp: SourceStamp }) {
  const { t } = useLingui()
  const { header, quorum } = block
  const value = {
    header,
    quorum: quorum ? { ...quorum, members: undefined, memberCount: quorum.members?.length } : null,
    transitionCount: block.txs.length,
  }
  return (
    <Card layer="platform" title={t`Block metadata`} source={stamp}>
      <JsonView value={value} label={t`Block metadata`} />
    </Card>
  )
}
