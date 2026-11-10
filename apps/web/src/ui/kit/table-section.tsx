import { useLocation } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { formatInt } from '@/lib/format'
import { Amount } from '../amount'
import { Badge } from '../badges'
import { EntityChip } from '../entities'
import { Card } from '../layout'
import { PalettePreview, PaletteShell, type PaletteGroup } from '../palette'
import { Nodeprint, LayerTile } from '../art'
import { Tabs } from '../tabs'
import { DataTable, NewRowsPill } from '../data-table'
import { Time } from '../amount'
import { ActiveFilters, FilterButton, SearchField, SegFilter, TableTools } from '../table-tools'
import { TypeBadge } from '../badges'
import { SourceLine } from '../states'
import { Group, Row } from './sections'
import { IDS, NOW, STAMPS, maskRows, type MasternodeRow } from './samples'

const STATUS: Record<MasternodeRow['status'], { word: string; cls: string }> = {
  good: { word: 'Answering', cls: 'rx-st--good' },
  warn: { word: 'No answer', cls: 'rx-st--warn' },
  bad: { word: 'Banned', cls: 'rx-st--bad' },
}

const COLUMNS: ColumnDef<MasternodeRow>[] = [
  {
    id: 'masternode',
    header: 'Masternode',
    accessorFn: (r) => r.ip,
    meta: { phone: 'title', width: '28%' },
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2.5">
        <Nodeprint id={row.original.id} evonode={row.original.kind === 'evonode'} size={28} />
        <span className="rx-2l">
          <span className="rx-mono font-semibold text-ink">{row.original.ip}</span>
          <span className="rx-sub">
            <span className="rx-tag">
              {row.original.kind === 'evonode' ? 'Evonode' : 'Masternode'}
            </span>
            <span className="rx-mono">
              {row.original.id.slice(0, 6)}…{row.original.id.slice(-4)}
            </span>
          </span>
        </span>
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'status',
    header: 'Answering',
    accessorFn: (r) => r.status,
    meta: { phone: 'primary' },
    cell: ({ row }) => (
      <span className={`rx-st ${STATUS[row.original.status].cls}`}>
        {STATUS[row.original.status].word}
      </span>
    ),
  },
  {
    id: 'version',
    header: 'Version',
    accessorFn: (r) => r.version,
    meta: { phone: 'secondary', filterable: true },
    cell: ({ row }) => (
      <span
        className={`rx-ver ${row.original.version.startsWith('23') ? 'rx-ver--old' : ''}`}
        style={{
          ['--v' as string]: row.original.version.startsWith('23')
            ? 'var(--dh-ramp-4)'
            : 'var(--dh-ramp-2)',
        }}
      >
        {row.original.version}
      </span>
    ),
  },
  {
    id: 'country',
    header: 'Location',
    accessorFn: (r) => r.city,
    meta: { phone: 'secondary', filterable: true },
    cell: ({ row }) => (
      <>
        <span className="rx-cc">{row.original.country}</span> {row.original.city}
      </>
    ),
  },
  {
    id: 'host',
    header: 'Hosting',
    accessorFn: (r) => r.host,
    meta: { phone: 'hidden', filterable: true },
  },
  {
    id: 'lastPaid',
    header: 'Last paid',
    accessorFn: (r) => r.lastPaid,
    meta: { numeric: true },
    cell: ({ row }) => (
      <>
        {formatInt(row.original.lastPaid)}{' '}
        <span className="rx-sub">{row.original.paidAgo} min ago</span>
      </>
    ),
  },
  {
    id: 'ready',
    header: 'Quorum-ready',
    accessorFn: (r) => (r.ready ? 'Ready' : 'Not ready'),
    meta: { phone: 'hidden' },
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={row.original.ready ? 'success' : 'warning'}>
        {row.original.ready ? 'Ready' : 'Not ready'}
      </Badge>
    ),
  },
]

interface FeedRow {
  id: string
  height: number
  txs: number
  size: string
  at: number
}

const FEED_COLUMNS: ColumnDef<FeedRow>[] = [
  {
    id: 'height',
    header: 'Block',
    accessorFn: (r) => r.height,
    cell: ({ row }) => (
      <EntityChip kind="block" id={String(row.original.height)} href="#table" copy={false} />
    ),
    meta: { phone: 'title' },
  },
  {
    id: 'txs',
    header: 'Transactions',
    accessorFn: (r) => r.txs,
    meta: { numeric: true, phone: 'secondary' },
  },
  {
    id: 'size',
    header: 'Size',
    accessorFn: (r) => r.size,
    meta: { numeric: true, phone: 'secondary' },
  },
  {
    id: 'reward',
    header: 'Reward',
    accessorFn: (r) => r.height,
    meta: { numeric: true, phone: 'primary' },
    cell: ({ row }) => (
      <Amount value={BigInt(row.original.height % 7) * 1_000_000n + 100_000_000n} kind="duffs" />
    ),
  },
  {
    id: 'at',
    header: 'Mined',
    accessorFn: (r) => r.at,
    meta: { align: 'end' },
    cell: ({ row }) => <Time ms={row.original.at} />,
  },
]

function feedRows(n: number, from = 2_569_992): FeedRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${from - i}`,
    height: from - i,
    txs: 20 + ((from - i) % 70),
    size: `${(8 + ((from - i) % 40)).toString()}.${(from - i) % 10} kB`,
    at: NOW - (i + 1) * 150_000,
  }))
}

export function TabsSection() {
  const hash = useLocation({ select: (l) => l.hash })
  const ids = ['overview', 'transitions', 'documents', 'tokens', 'keys']
  const value = ids.includes(hash) ? hash : 'overview'
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'transitions', label: 'Transitions', count: 22 },
    { id: 'documents', label: 'Documents', count: 15 },
    { id: 'tokens', label: 'Tokens', disabled: true },
    { id: 'keys', label: 'Keys', count: 6 },
  ]
  return (
    <Group
      id="tabs"
      title="Tabs"
      description="Links, not buttons. The current tab carries the layer keyline."
    >
      {(['platform', 'core', 'network', 'neutral'] as const).map((layer) => (
        <div key={layer} className="mb-3">
          <Tabs tabs={tabs} value={value} layer={layer} to={(id) => ({ to: '/__kit', hash: id })} />
        </div>
      ))}
    </Group>
  )
}

export function TableSection() {
  const [sort, setSort] = useState('-lastPaid')
  const [seg, setSeg] = useState('all')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<{ id: string; label: string }[]>([
    { id: 'status', label: 'Status: Enabled' },
  ])
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<FeedRow[]>([])
  const [page, setPage] = useState(1)
  const [infinite, setInfinite] = useState(8)
  const all = useMemo(() => maskRows(22), [])
  const rows = useMemo(() => {
    const filtered = all.filter(
      (r) =>
        (seg === 'all' ? true : r.kind === seg) &&
        (q === '' || r.ip.includes(q) || r.city.toLowerCase().includes(q.toLowerCase())),
    )
    const desc = sort.startsWith('-')
    const key = sort.replace(/^-/, '') as keyof MasternodeRow
    return [...filtered].sort((a, b) => {
      const x = a[key]
      const y = b[key]
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return desc ? -c : c
    })
  }, [all, sort, seg, q])
  const feed = [...extra, ...feedRows(9)]
  const big = useMemo(() => feedRows(120, 2_569_992), [])

  return (
    <Group
      id="table"
      title="DataTable"
      description="Sort by mouse and keyboard; j and k move through rows, Enter opens; on a phone every row is a card."
    >
      <Card
        layer="network"
        padding="flush"
        title="Masternodes"
        source={[STAMPS.radar, STAMPS.dapi]}
      >
        <TableTools>
          <SegFilter
            label="Type"
            value={seg}
            onChange={setSeg}
            options={[
              { id: 'all', label: 'All', count: 22 },
              {
                id: 'masternode',
                label: 'Masternodes',
                count: all.filter((r) => r.kind === 'masternode').length,
              },
              {
                id: 'evonode',
                label: 'Evonodes',
                count: all.filter((r) => r.kind === 'evonode').length,
              },
            ]}
          />
          <SearchField
            label="Search masternodes"
            value={q}
            onChange={setQ}
            placeholder="ProTx, IP, payout address, host or city"
          />
          <FilterButton label="Status" value="Enabled" on hideOnPhone />
          <FilterButton label="Version" hideOnPhone />
          <FilterButton label="Country" hideOnPhone />
          <FilterButton label="Filters" value={filters.length} phoneOnly />
        </TableTools>
        <ActiveFilters
          matches={rows.length}
          tokens={filters}
          onRemove={(id) => {
            setFilters((f) => f.filter((x) => x.id !== id))
          }}
          onClear={() => {
            setFilters([])
          }}
        >
          Sorted by {sort.replace(/^-/, '')} · click a version, country or host to filter by it
        </ActiveFilters>
        <DataTable
          caption="Masternodes"
          columns={COLUMNS}
          rows={rows}
          getRowId={(r) => r.id}
          state="ready"
          sort={{ value: sort, onChange: setSort }}
          rowLink={(r) => ({ to: '/__kit', hash: `mn-${r.id.slice(0, 6)}` })}
          onCellFilter={(col, value) => {
            setFilters((f) => [
              ...f.filter((x) => x.id !== col),
              { id: col, label: `${col}: ${value}` },
            ])
          }}
          paging={{
            kind: 'page',
            page: 1,
            limit: 22,
            total: 2207,
            to: (p) => ({ to: '/__kit', hash: `page-${p}` }),
          }}
        />
      </Card>

      <div className="rx-grid mt-4">
        <div className="rx-c6">
          <Card
            layer="core"
            padding="flush"
            title="Latest blocks"
            source={STAMPS.dapi}
            actions={
              <NewRowsPill
                count={extra.length > 0 && fresh.size === 0 ? extra.length : 0}
                noun="blocks"
                onShow={() => undefined}
              />
            }
          >
            <DataTable
              caption="Latest Core blocks"
              columns={FEED_COLUMNS}
              rows={feed}
              getRowId={(r) => r.id}
              state="ready"
              live={{ newRowIds: fresh }}
              paging={{ kind: 'cursor', next: { to: '/__kit', hash: 'older' }, prev: undefined }}
            />
            <div className="p-3">
              <button
                type="button"
                className="dh-btn dh-btn--sm"
                onClick={() => {
                  const h = 2_569_992 + extra.length + 1
                  setExtra((e) => [
                    { id: `b${h}`, height: h, txs: 31, size: '12.4 kB', at: Date.now() },
                    ...e,
                  ])
                  setFresh(new Set([`b${h}`]))
                }}
              >
                Add a block
              </button>
            </div>
          </Card>
        </div>
        <div className="rx-c6">
          <Card layer="platform" padding="flush" title="Infinite" source={STAMPS.pe}>
            <DataTable
              caption="Blocks, loading more as you go"
              columns={FEED_COLUMNS}
              rows={feedRows(infinite, 468_952)}
              getRowId={(r) => r.id}
              state="ready"
              paging={{
                kind: 'infinite',
                hasNext: infinite < 24,
                fetching: false,
                fetchNext: () => {
                  setInfinite((n) => n + 8)
                },
              }}
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card layer="core" padding="flush" title="Loading">
            <DataTable
              caption="Loading"
              columns={FEED_COLUMNS.slice(0, 3)}
              rows={[]}
              getRowId={(r) => r.id}
              state="loading"
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card layer="platform" padding="flush" title="Empty">
            <DataTable
              caption="Empty"
              columns={FEED_COLUMNS.slice(0, 3)}
              rows={[]}
              getRowId={(r) => r.id}
              state="empty"
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card layer="network" padding="flush" title="Error">
            <DataTable
              caption="Error"
              columns={FEED_COLUMNS.slice(0, 3)}
              rows={[]}
              getRowId={(r) => r.id}
              state="error"
              error={new Error('x')}
              onRetry={() => undefined}
            />
          </Card>
        </div>
        <div className="rx-c8">
          <Card
            layer="core"
            padding="flush"
            title="Paged, scrolls sideways on a phone"
            source={STAMPS.hyphen}
          >
            <DataTable
              caption="Rich list"
              phone="scroll"
              columns={FEED_COLUMNS}
              rows={feedRows(5)}
              getRowId={(r) => r.id}
              state="ready"
              paging={{
                kind: 'page',
                page: 2,
                limit: 5,
                total: 40,
                to: (p) => ({ to: '/__kit', hash: `p${p}` }),
              }}
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card layer="network" title="Page state">
            <Row>
              <span className="text-[13px] text-ink-2">Page {page}</span>
              <button
                type="button"
                className="dh-btn dh-btn--sm"
                onClick={() => {
                  setPage((p) => p + 1)
                }}
              >
                Next
              </button>
            </Row>
          </Card>
        </div>
        <div className="rx-c12">
          <Card layer="core" padding="flush" title="Virtual, 120 rows">
            <DataTable
              caption="120 blocks"
              columns={FEED_COLUMNS}
              rows={big}
              getRowId={(r) => r.id}
              state="ready"
              virtual
            />
          </Card>
        </div>
      </div>
    </Group>
  )
}

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: 'names',
    heading: 'Usernames',
    icon: 'name',
    items: [
      {
        id: 'pshenmic',
        glyph: <LayerTile layer="platform" icon="name" size={28} />,
        title: (
          <>
            <mark>psh</mark>enmic.dash
          </>
        ),
        detail: 'Identity BjixEU…iYqp · 6 keys',
        end: '↵',
        href: '#palette',
      },
      {
        id: 'pshenmic2',
        glyph: <LayerTile layer="platform" icon="name" size={28} />,
        title: (
          <>
            <mark>psh</mark>ow.dash
          </>
        ),
        detail: 'Identity 7P3ZsJ…Tn9J',
        href: '#palette',
      },
    ],
  },
  {
    id: 'mn',
    heading: 'Masternodes',
    icon: 'node',
    items: [
      {
        id: 'mn1',
        glyph: <Nodeprint id={IDS.protx} size={28} />,
        title: '188.40.163.5:9999',
        detail: 'Hetzner · Falkenstein, DE',
        end: '5 min',
        href: '#palette',
      },
    ],
  },
  {
    id: 'go',
    heading: 'Go to',
    icon: 'arrow',
    items: [
      {
        id: 'g1',
        glyph: <LayerTile layer="network" icon="map" size={28} />,
        title: 'Masternode map',
        detail: 'Network',
        href: '#palette',
      },
    ],
  },
]

export function PaletteSection() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('psh')
  const [selected, setSelected] = useState('pshenmic')
  return (
    <Group
      id="palette"
      title="Command palette shell"
      description="cmdk inside a Radix dialog. Features fill it with resolver results."
    >
      <Row>
        <button
          type="button"
          className="dh-btn"
          onClick={() => {
            setOpen(true)
          }}
        >
          Open the palette
        </button>
        <span className="text-[13px] text-ink-2">
          Opens at 880 px; full screen on a phone. Esc closes, ⇧↵ opens in a new tab.
        </span>
      </Row>
      <PaletteShell
        open={open}
        onOpenChange={setOpen}
        query={query}
        onQueryChange={setQuery}
        classifier={{
          label: 'Name prefix',
          icon: 'name',
          layer: 'platform',
          text: 'Searching Mainnet names, identities and saved items',
        }}
        groups={PALETTE_GROUPS}
        selectedId={selected}
        onSelectedChange={setSelected}
        onSelect={() => {
          setOpen(false)
        }}
        networkHint={
          <>
            Mainnet · 1 match on Testnet ·{' '}
            <a className="rx-go" href="#palette">
              Show
            </a>
          </>
        }
        empty={
          <>
            Nothing on Mainnet for “{query}”. Try a full txid, a block height, an IP or a username.
          </>
        }
        preview={
          <PalettePreview
            glyph={<LayerTile layer="platform" icon="name" size={48} />}
            title="pshenmic.dash"
            badge={<TypeBadge type="identity-create" />}
            id={IDS.identity}
            rows={[
              { label: 'Balance', value: <Amount value={1_013_331_591_984n} kind="credits" /> },
              { label: 'Keys', value: '6 · 1 master' },
              { label: 'Transitions', value: '22' },
            ]}
            source={STAMPS.proof}
            href="#palette"
            openLabel="Open identity"
          />
        }
      />
      <div className="mt-3 max-w-xs">
        <SourceLine stamp={STAMPS.proof} compact />
      </div>
    </Group>
  )
}
