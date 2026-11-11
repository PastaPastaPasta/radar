import { useLingui } from '@lingui/react/macro'
import type { HyProposal } from '@/data/hyphen/schemas'
import { useNetwork } from '@/features/entity'
import { Icon, LinkOut } from '@/ui'
import { safeProposalUrl } from './status'

/** The proposal's own page, where it explains itself, and Governance, where masternode owners vote. */
export function ProposalLinks({ p }: { p: HyProposal }) {
  const { t } = useLingui()
  const net = useNetwork()
  const doc = safeProposalUrl(p.url)
  return (
    <>
      {doc ? (
        <a
          className="rx-go-ext"
          href={doc.href}
          target="_blank"
          rel="noopener noreferrer"
          data-proposal-url
        >
          {doc.host}
          <Icon name="ext" size="sm" className="rx-ext" />
          <span className="dh-sr"> {t`(opens in a new tab)`}</span>
        </a>
      ) : null}
      <LinkOut to={{ app: 'gov', action: 'proposal', hash: p.hash, net }}>
        {t`Vote in Governance`}
      </LinkOut>
    </>
  )
}
