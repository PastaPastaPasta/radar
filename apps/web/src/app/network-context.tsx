import { Link } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNetwork } from '@/features/entity'
import { isDevnet, type DevnetConfig } from '@/lib/network'
import { devnetName, hasDevnet, saveDevnet, useDevnets } from './devnets'

export { useNetwork }

const ADDRESS = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\]):\d{1,5}$/i

function parseAddresses(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function DevnetSetup({ name }: { name: string }) {
  const [addresses, setAddresses] = useState('')
  const [quorumUrl, setQuorumUrl] = useState('')
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const list = parseAddresses(addresses)
    if (list.length === 0 || !list.every((a) => ADDRESS.test(a))) {
      setError('Enter at least one DAPI address as host:port, one per line.')
      return
    }
    const quorum = quorumUrl.trim()
    if (quorum && !/^https:\/\/\S+$/.test(quorum)) {
      setError('The quorum list URL must start with https://.')
      return
    }
    const config: DevnetConfig = { name, dapiAddresses: list, ...(quorum && { quorumUrl: quorum }) }
    saveDevnet(config)
  }

  return (
    <section
      aria-labelledby="devnet-setup"
      className="grid max-w-xl gap-4"
      data-network-gate="setup"
    >
      <h1 id="devnet-setup" className="text-2xl font-semibold">
        Set up the {name} devnet
      </h1>
      <p>
        Radar doesn’t know this devnet yet. Add the addresses of a few of its DAPI nodes and it will
        read the network from them. This stays in this browser.
      </p>
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1">
          <span>DAPI addresses</span>
          <textarea
            name="addresses"
            rows={4}
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            placeholder="192.0.2.10:1443"
            spellCheck={false}
            className="rounded border px-3 py-2 font-mono"
          />
        </label>
        <label className="grid gap-1">
          <span>Quorum list URL (optional)</span>
          <input
            name="quorumUrl"
            type="url"
            value={quorumUrl}
            onChange={(e) => setQuorumUrl(e.target.value)}
            placeholder={`https://quorums.${name}.networks.dash.org`}
            className="rounded border px-3 py-2"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-4">
          <button type="submit" className="rounded px-4 py-2 font-medium">
            Use this devnet
          </button>
          <Link to="/" search={{ network: 'mainnet' }}>
            Back to Mainnet
          </Link>
        </div>
      </form>
    </section>
  )
}

/** Renders the page, or a setup form when the URL names a devnet Radar doesn't know. */
export function NetworkGate({ children }: { children: ReactNode }) {
  const net = useNetwork()
  const saved = useDevnets()
  if (isDevnet(net) && !hasDevnet(net, saved))
    return <DevnetSetup key={net} name={devnetName(net)} />
  return <>{children}</>
}
