import { useState } from 'react'
import { EpochClock } from '../epoch-clock'
import { JsonView } from '../json-view'
import { Card } from '../layout'
import { ListModeToggle, useListMode } from '../list-mode'
import { DateRangeFilter, RangeFilter, TableTools } from '../table-tools'
import { Group, Row } from './sections'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const DOCUMENT = {
  $id: 'F3a9c1d2e4b6a8c0e2d4f6a8b0c2e4d6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8',
  $revision: 3n,
  label: 'pshenmic',
  normalizedLabel: 'pshenmic',
  records: { identity: Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256) },
  balance: 36_921_000_000_000_000_000n,
  active: true,
  note: null,
  tags: ['dash', 'platform', 'name'],
  nested: { a: { b: { c: [1, 2.5, -3] } }, empty: {}, none: [] },
}

const LONG = Array.from({ length: 250 }, (_, i) => ({ height: 468_000 + i, ok: i % 7 !== 0 }))

function Filters() {
  const [balance, setBalance] = useState<string | undefined>('10..250')
  const [open, setOpen] = useState<string | undefined>('..5')
  const [fresh, setFresh] = useState<string | undefined>()
  const [dates, setDates] = useState<{ from?: string; to?: string }>({
    from: '2026-10-01',
    to: '2026-10-31',
  })
  const [after, setAfter] = useState<{ from?: string; to?: string }>({ from: '2026-11-01' })
  const [none, setNone] = useState<{ from?: string; to?: string }>({})
  return (
    <>
      <Card layer="platform" title="RangeFilter" padding="flush">
        <TableTools>
          <RangeFilter label="Balance" value={balance} onChange={setBalance} />
          <RangeFilter label="Gas" value={open} onChange={setOpen} />
          <RangeFilter label="Documents" value={fresh} onChange={setFresh} />
        </TableTools>
        <p className="m-0 p-3 text-[13px] text-ink-2" data-testid="kit-range-value">
          Balance: {balance ?? 'none'} · Gas: {open ?? 'none'} · Documents: {fresh ?? 'none'}. Press
          Enter or move on to apply; a minimum above the maximum is refused with a message.
        </p>
      </Card>
      <div className="h-4" />
      <Card layer="platform" title="DateRangeFilter" padding="flush">
        <TableTools>
          <DateRangeFilter label="Created" from={dates.from} to={dates.to} onChange={setDates} />
          <DateRangeFilter label="Voted" from={after.from} to={after.to} onChange={setAfter} />
          <DateRangeFilter label="Seen" from={none.from} to={none.to} onChange={setNone} />
        </TableTools>
        <p className="m-0 p-3 text-[13px] text-ink-2">
          Created: {dates.from ?? '…'} to {dates.to ?? '…'} · Voted: {after.from ?? '…'} to{' '}
          {after.to ?? '…'} · Seen: {none.from ?? '…'} to {none.to ?? '…'}
        </p>
      </Card>
    </>
  )
}

function ListModes() {
  const a = useListMode('kit-a')
  return (
    <>
      <Card layer="neutral" title="ListModeToggle" padding="flush">
        <TableTools>
          <ListModeToggle listId="kit-a" />
        </TableTools>
        <p className="m-0 p-3 text-[13px] text-ink-2" data-testid="kit-list-mode">
          kit-a: {a.mode}, {a.limit} rows. Remembered in this browser under radar.list.kit-a.
        </p>
      </Card>
      <div className="h-4" />
      <Card layer="neutral" title="A second list keeps its own choice" padding="flush">
        <TableTools>
          <ListModeToggle listId="kit-b" />
        </TableTools>
      </Card>
    </>
  )
}

function Clocks() {
  const base = useState(() => Date.now())[0]
  const at = (startedHoursAgo: number, endsInHours: number) => ({
    startedAt: base - startedHoursAgo * HOUR,
    expectedEndAt: base + endsInHours * HOUR,
  })
  return (
    <div className="grid gap-4">
      <Card layer="platform" padding="flush">
        <EpochClock index={88} blocksSoFar={1091} estimated {...at(32, 142)} />
      </Card>
      <Card layer="platform" padding="flush" title="Medium">
        <EpochClock index={88} blocksSoFar={1091} estimated size="md" {...at(32, 142)} />
      </Card>
      <Card layer="platform" padding="flush" title="End time known, not an estimate">
        <EpochClock index={87} blocksSoFar={3650} estimated={false} {...at(120, 48)} />
      </Card>
      <Card layer="platform" padding="flush" title="Just started">
        <EpochClock index={89} blocksSoFar={0} estimated {...at(0.1, 167)} />
      </Card>
      <Card layer="platform" padding="flush" title="Past its expected end (estimate)">
        <EpochClock index={90} blocksSoFar={3702} estimated {...at(170, -2)} />
      </Card>
      <Card layer="platform" padding="flush" title="Past its end (known)">
        <EpochClock index={86} estimated={false} {...at(190, -22)} />
      </Card>
      <Card layer="platform" padding="flush" title="No end time yet, blocks only">
        <EpochClock index={91} startedAt={base - 5 * DAY} blocksSoFar={2480} estimated size="md" />
      </Card>
    </div>
  )
}

export function SharedToolsSection() {
  return (
    <Group
      id="shared"
      title="Shared list and detail tools"
      description="JsonView for documents and raw state, number and date range filters, the pages or scroll choice, and the epoch clock."
    >
      <h3 className="rx-sec__sub mb-2 mt-6 text-[15px] font-semibold">JsonView</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <Row label="Default: root open">
          <div className="w-full">
            <JsonView value={DOCUMENT} />
          </div>
        </Row>
        <Row label="Open to depth 4, 220 px tall, base64 bytes">
          <div className="w-full">
            <JsonView value={DOCUMENT} collapsedDepth={4} maxHeight={220} bytes="base64" />
          </div>
        </Row>
        <Row label="Closed, no copy button">
          <div className="w-full">
            <JsonView value={DOCUMENT} collapsedDepth={0} copy={false} />
          </div>
        </Row>
        <Row label="Long array: first 100, then more">
          <div className="w-full">
            <JsonView value={LONG} collapsedDepth={1} maxHeight={260} />
          </div>
        </Row>
        <Row label="A single value">
          <div className="w-full">
            <JsonView value={123_456_789_012_345_678_901n} />
          </div>
        </Row>
        <Row label="Empty containers">
          <div className="w-full">
            <JsonView value={{ object: {}, array: [], text: '' }} />
          </div>
        </Row>
      </div>
      <h3 className="rx-sec__sub mb-2 mt-8 text-[15px] font-semibold">Range filters</h3>
      <Filters />
      <h3 className="rx-sec__sub mb-2 mt-8 text-[15px] font-semibold">List mode</h3>
      <ListModes />
      <h3 className="rx-sec__sub mb-2 mt-8 text-[15px] font-semibold">EpochClock</h3>
      <Clocks />
    </Group>
  )
}
