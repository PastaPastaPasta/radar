import { useLingui } from '@lingui/react/macro'
import { Link, useSearch } from '@tanstack/react-router'
import { PageFrame } from '@/features/entity'
import { Card } from '@/ui'
import { DECODER_IDS, DECODER_TEXT, isDecoderId, type DecoderId } from './decoders'
import { ByteDecoder, DocumentDecoder } from './ObjectDecoder'
import { PathTool } from './PathTool'
import { ProofDecoder } from './ProofDecoder'

function DecoderIndex() {
  const { t, i18n } = useLingui()
  return (
    <PageFrame
      path="/tools/$decoder"
      title={t`Decoders`}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={t`Read Platform's own formats in this browser: contracts, identities, documents, proofs and paths. Nothing you paste is sent anywhere.`}
    >
      <Card title={t`Choose a decoder`} layer="platform">
        <ul className="grid gap-3 sm:grid-cols-2" data-decoders>
          {DECODER_IDS.map((id) => (
            <li key={id} className="grid gap-1">
              <Link
                to="/tools/$decoder"
                params={{ decoder: id }}
                className="font-semibold"
                data-decoder-link={id}
              >
                {i18n._(DECODER_TEXT[id].title)}
              </Link>
              <span className="text-sm text-[var(--dh-ink-2)]">
                {i18n._(DECODER_TEXT[id].about)}
              </span>
            </li>
          ))}
          <li className="grid gap-1">
            <Link to="/tools/transition" className="font-semibold" data-decoder-link="transition">
              {t`State transition`}
            </Link>
            <span className="text-sm text-[var(--dh-ink-2)]">
              {t`Decode a signed state transition and ask Platform whether it would be accepted.`}
            </span>
          </li>
        </ul>
      </Card>
    </PageFrame>
  )
}

function Body({ id }: { id: DecoderId }) {
  const { t } = useLingui()
  const search = useSearch({ from: '/tools/$decoder' })
  switch (id) {
    case 'contract':
      return <ByteDecoder kind="dataContract" label={t`Serialized data contract`} />
    case 'identity':
      return <ByteDecoder kind="identity" label={t`Serialized identity`} />
    case 'document':
      return <DocumentDecoder contract={search.contract} type={search.type} />
    case 'proof':
      return <ProofDecoder />
    case 'path':
      return <PathTool preset={search.preset} />
  }
}

export function DecoderPage({ decoder }: { decoder: string }) {
  const { t, i18n } = useLingui()
  if (!isDecoderId(decoder)) return <DecoderIndex />
  const text = DECODER_TEXT[decoder]
  return (
    <PageFrame
      path="/tools/$decoder"
      title={i18n._(text.title)}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={i18n._(text.about)}
    >
      <Body id={decoder} />
    </PageFrame>
  )
}
