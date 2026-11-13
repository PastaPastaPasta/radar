import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { PageFrame, PageLink } from '@/features/entity'
import { Card } from '@/ui'
import { THIRD_PARTY } from './third-party'

const REPO = 'https://github.com/PastaPastaPasta/radar'

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  )
}

/** What Radar can and can’t prove, where to act, and what it remembers. Static: it reads nothing from any source. */
export function AboutPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/about"
      title={t`About`}
      eyebrow={t`You`}
      layer="neutral"
      lede={t`Radar is a read-only explorer for Dash Core, Dash Platform and the network under both. It never signs, never broadcasts and never asks for a key.`}
    >
      <Card id="proofs" title={t`What “proof-checked” means`}>
        <div className="grid max-w-3xl gap-3">
          <p>
            {t`Dash Platform answers carry a cryptographic proof. The Platform SDK in your browser checks it against the public key of the validator quorum that signed it, before Radar shows the figure. A node that answered can’t make a value up: the check fails and Radar says so. Those figures are marked “Proof-checked”, and the mark opens the proof inspector.`}
          </p>
          <p>
            {t`Everything else is a one-node claim: one DAPI node, or one service such as Platform Explorer, Radar’s crawler, Hyphen or Insight, said so, and nothing in your browser could check it. Radar names the source beside each figure, with its age. Core data is read from DAPI nodes and is not proof-checked.`}
          </p>
          <p>
            {t`A figure Radar adds up from several proof-checked answers, such as a tally over a range of blocks, is not itself proved. It says “Combined from N proof-checked answers”.`}
          </p>
        </div>
      </Card>

      <Card id="lists" title={t`What can’t be listed without an index`}>
        <div className="grid max-w-3xl gap-3">
          <p>
            {t`A proof answers a question about a key: this identity’s balance, this contract, this document. Dash Platform can’t prove a list of everything, so there is no “all identities”, “every holder of this token” or “all documents about X” to ask a node.`}
          </p>
          <p>
            {t`Lists come from indexes: Platform Explorer and Radar’s own crawler. Radar reads the rows from the index and then checks each row’s facts with proofs where it can; the checked value wins over the index’s. Without an index, you can still open anything whose ID you know. Decentralized only mode switches the indexes off to show exactly that: only what DAPI nodes and the Platform SDK can answer.`}
          </p>
          <p>
            <PageLink to="/sources">{t`See every source and the switch`}</PageLink>
          </p>
        </div>
      </Card>

      <Card id="act" title={t`Where to act`}>
        <div className="grid max-w-3xl gap-3">
          <p>
            {t`Radar only reads. To top up an identity, register a name, or work with a token, a contract or a Platform address, use Bridge. To vote on a proposal or as a masternode, use Governance. Each link opens in a new tab and carries the network you were looking at.`}
          </p>
          <p className="flex flex-wrap gap-4">
            <Out href="https://bridge.dashhq.org/">{t`Bridge`}</Out>
            <Out href="https://gov.dashhq.org/">{t`Governance`}</Out>
          </p>
        </div>
      </Card>

      <Card id="privacy" title={t`Privacy`}>
        <div className="grid max-w-3xl gap-3">
          <p>
            {t`Radar has no analytics, no cookies, no accounts and no advertising. Your choices and anything you save stay in this browser: your saved items, the identities you viewed (off unless you turn it on), the names you gave, your settings and devnets, and a cache of recent answers so pages open quickly. A service worker keeps Radar’s own files so it can open offline.`}
          </p>
          <p>
            {t`To read the network, your browser asks DAPI nodes, the Platform SDK’s nodes and quorum list, and, unless you turn them off, Platform Explorer, Radar’s crawler, Hyphen, Insight and a price feed. Each one sees your IP address and what you asked it, like any web server.`}
          </p>
          <p>
            {t`To clear it: the buttons on Settings and Saved remove each list, “Clear the SDK cache” removes the cached answers, and your browser’s “clear site data” removes everything, including the service worker.`}
          </p>
          <p>
            <PageLink to="/settings">{t`Open settings`}</PageLink>
          </p>
        </div>
      </Card>

      <Card id="licences" title={t`Sources and licences`}>
        <div className="grid max-w-3xl gap-3">
          <p>
            {t`Radar’s code is open source under the MIT licence. Where it adapts code or data from another project, that project is listed here and in the file it lives in. Libraries installed through npm and cargo keep their own licences.`}{' '}
            <Out href={REPO}>{t`Radar on GitHub`}</Out>
          </p>
          {THIRD_PARTY.length === 0 ? null : (
            <ul className="grid gap-2" aria-label={t`Adapted code and data`}>
              {THIRD_PARTY.map((row) => (
                <li
                  key={`${row.component}|${row.source}`}
                  className="grid gap-0.5"
                  data-third-party
                >
                  <strong>{row.component}</strong>
                  <span className="text-[var(--dh-ink-2)]">
                    {row.url ? <Out href={row.url}>{row.source}</Out> : row.source} · {row.licence}{' '}
                    · <code>{row.usedIn}</code>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </PageFrame>
  )
}
