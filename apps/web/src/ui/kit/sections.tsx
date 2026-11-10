import { useEffect, useState, type ReactNode } from 'react'
import { healthRegistry, resetHealthRegistry } from '@/data/health'
import { formatInt } from '@/lib/format'
import { Amount, Time } from '../amount'
import { Identicon, LayerGlyph, LayerTile, Nodeprint } from '../art'
import { Badge, TypeBadge } from '../badges'
import { Chart } from '../chart'
import { Copy, EntityChip, Hash } from '../entities'
import { Icon } from '../icon'
import { KIND_META, TYPE_META } from '../kinds'
import { Card, KeyValue, SectionBand } from '../layout'
import { LinkOut, LinkOutCard } from '../link-out'
import { Meter, Sparkline, Stat } from '../stat'
import {
  Empty,
  ErrorState,
  LiveControl,
  LiveDot,
  Skeleton,
  SourceLine,
  type SkeletonProps,
} from '../states'
import { SourceError } from './source-error'
import type { Layer } from '../types'
import { UnitsProvider } from '../units-context'
import { CHIP_SAMPLES, IDS, NOW, STAMPS } from './samples'

export function Group({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rx-sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id={`${id}-h`}>
          {title}
        </h2>
        {description ? <p className="rx-sec__desc">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function Row({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-2">
      {label ? <span className="w-36 shrink-0 text-[13px] text-ink-2">{label}</span> : null}
      {children}
    </div>
  )
}

const LAYERS: Layer[] = ['core', 'platform', 'network', 'neutral']

function Swatch({ name, bg }: { name: string; bg: string }) {
  return (
    <div
      className="flex h-14 min-w-[104px] flex-1 flex-col items-start justify-end rounded-1 border border-line p-1 text-[11.5px]"
      style={{ background: bg }}
    >
      <span
        className="rounded-1 px-1.5 py-px"
        style={{ background: 'var(--dh-surface)', color: 'var(--dh-ink)' }}
      >
        {name}
      </span>
    </div>
  )
}

export function TokensSection() {
  const sets: { layer: string; keys: string[] }[] = [
    { layer: 'core', keys: ['', '-ink', '-soft', '-line', '-text'] },
    { layer: 'plat', keys: ['', '-ink', '-soft', '-line', '-text'] },
    { layer: 'net', keys: ['', '-ink', '-soft', '-line', '-text'] },
  ]
  return (
    <Group id="tokens" title="Tokens" description="Layer hues, the plate, data colours and type.">
      <div className="rx-grid">
        <div className="rx-c8">
          <Card title="Layer hues">
            {sets.map((s) => (
              <Row key={s.layer} label={s.layer}>
                <div className="flex flex-1 flex-wrap gap-2">
                  {s.keys.map((k) => (
                    <Swatch key={k} name={`rx-${s.layer}${k}`} bg={`var(--rx-${s.layer}${k})`} />
                  ))}
                </div>
              </Row>
            ))}
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Data colours">
            <Row label="Blue ramp">
              {[1, 2, 3, 4, 5].map((n) => (
                <Swatch key={n} name={`ramp-${n}`} bg={`var(--dh-ramp-${n})`} />
              ))}
            </Row>
            <Row label="Teal ramp">
              {[1, 2, 3, 4, 5].map((n) => (
                <Swatch key={n} name={`teal-${n}`} bg={`var(--rx-teal-${n})`} />
              ))}
            </Row>
            <Row label="Calendar">
              {[1, 2, 3].map((n) => (
                <Swatch key={n} name={`cal-${n}`} bg={`var(--rx-cal-${n})`} />
              ))}
            </Row>
            <Row label="Identicons">
              {Array.from({ length: 8 }, (_, n) => (
                <Swatch key={n} name={`id-${n}`} bg={`var(--rx-id-${n})`} />
              ))}
            </Row>
          </Card>
        </div>
      </div>
      <div className="rx-plate mt-4 rounded-3 p-5">
        <p className="mb-3 text-[13px] text-ink-2">
          The plate: redeclared tokens inside .rx-plate.
        </p>
        <div className="flex flex-wrap gap-2">
          {['plate', 'plate-2', 'plate-3', 'plate-0', 'plate-4', 'plate-edge', 'plate-ctl'].map(
            (n) => (
              <Swatch key={n} name={`rx-${n}`} bg={`var(--rx-${n})`} />
            ),
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-1">
        <p className="m-0 text-[40px] leading-[1.05] font-[680] [font-stretch:116%]">
          Headline 40 / 680
        </p>
        <p className="m-0 text-[30px] font-[660] [font-stretch:110%]">Page title 30 / 660</p>
        <p className="m-0 text-[21px] font-[660] [font-stretch:110%]">Section title 21 / 660</p>
        <p className="m-0 text-[17px] font-[620]">Card title 17 / 620</p>
        <p className="m-0 text-[15px]">Body 15 / 400 — the quick brown fox 0123456789</p>
        <p className="m-0 text-[14px] font-[520]">UI 14 / 520 — tabs, buttons and tables</p>
        <p className="m-0 text-[13px] text-ink-2">Small 13 — labels, notes and sources</p>
        <p className="m-0 font-mono text-[13px]">Mono 13 — 000000000000001ba106dbf586a6d6e5</p>
      </div>
    </Group>
  )
}

function DownSource({ children }: { children: ReactNode }) {
  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      healthRegistry.report('mainnet', 'rate', { ok: false, latencyMs: 100, kind: 'network' })
    }
    return () => {
      resetHealthRegistry()
    }
  }, [])
  return <>{children}</>
}

export function LayoutSection() {
  return (
    <Group
      id="layout"
      title="Card, SectionBand, KeyValue"
      description="Every Card state, a source that is down, and the zone band."
    >
      <div className="rx-grid">
        <div className="rx-c4">
          <Card title="Plain card" subtitle="Neutral, no layer">
            Body text sits 20 px in.
          </Card>
        </div>
        <div className="rx-c4">
          <Card
            title="Core blocks"
            layer="core"
            actions={<span className="rx-go">All blocks</span>}
            source={STAMPS.dapi}
          >
            Layer tile in the title; source beside the figures.
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Platform" layer="platform" id="kit-anchor-card" source={STAMPS.pe}>
            Hover the head for the copy-link icon.
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Loading" layer="core" state="loading">
            hidden
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Latest transitions" layer="platform" state="empty">
            hidden
          </Card>
        </div>
        <div className="rx-c4">
          <Card
            title="Identities"
            layer="platform"
            state="error"
            error={new SourceError('pe', 'network', 'fetch failed')}
            onRetry={() => undefined}
          >
            hidden
          </Card>
        </div>
        <div className="rx-c6">
          <DownSource>
            <Card title="Price" layer="network" source={STAMPS.rateDown} onRetry={() => undefined}>
              <p className="m-0">
                $46.20 per DASH. The source is down, so the body drops to 45% and says so.
              </p>
            </Card>
          </DownSource>
        </div>
        <div className="rx-c6">
          <Card title="Flush body" layer="core" padding="flush" subtitle="Tables run edge to edge">
            <div className="p-4 text-[14px]">Content with its own padding.</div>
          </Card>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-3 border border-line">
        {LAYERS.slice(0, 3).map((l) => (
          <SectionBand
            key={l}
            layer={l}
            id={`kit-band-${l}`}
            title={
              KIND_META[l === 'core' ? 'block' : l === 'platform' ? 'identity' : 'masternode']
                .label + ' zone'
            }
            description="One ruled head per zone"
            actions={<span className="rx-go">All records</span>}
          >
            <div className="pb-4 text-[14px] text-ink-2">Zone content sits in the container.</div>
          </SectionBand>
        ))}
      </div>
      <div className="rx-grid mt-6">
        <div className="rx-c4">
          <Card title="Facts" layer="platform">
            <KeyValue
              items={[
                {
                  label: 'Balance',
                  value: <Amount value={1_013_331_591_984n} kind="credits" />,
                  source: STAMPS.proof,
                },
                { label: 'Created', value: <Time ms={NOW - 86_400_000 * 40} mode="both" /> },
                {
                  label: 'Keys',
                  value: '6 · 1 master',
                  hint: 'The master key is disabled for signing.',
                },
                { label: 'Names', value: 'pshenmic.dash, cryptofan.dash' },
              ]}
            />
          </Card>
        </div>
        <div className="rx-c8">
          <Card title="Two columns" layer="network">
            <KeyValue
              columns={2}
              items={[
                { label: 'Version', value: <span className="rx-mono">24.0.0</span> },
                { label: 'Hosting', value: 'Hetzner' },
                { label: 'Location', value: 'Falkenstein, DE' },
                { label: 'Last paid', value: <EntityChip kind="block" id="2569988" /> },
              ]}
            />
          </Card>
          <div className="h-4" />
          <Card title="Three columns" layer="core">
            <KeyValue
              columns={3}
              items={[
                { label: 'Inputs', value: '4' },
                { label: 'Outputs', value: '2' },
                { label: 'Size', value: '1.2 kB' },
              ]}
            />
          </Card>
        </div>
      </div>
    </Group>
  )
}

function Ticking() {
  const [n, setN] = useState(2_569_992)
  return (
    <div className="flex items-center gap-3">
      <div className="w-[220px]">
        <Stat label="Core height" value={formatInt(n)} layer="core" source={STAMPS.dapi} />
      </div>
      <button
        type="button"
        className="dh-btn dh-btn--sm"
        onClick={() => {
          setN((v) => v + 1)
        }}
      >
        New block
      </button>
    </div>
  )
}

const SPARK = [4, 6, 5, 9, 7, 12, 10, 14, 13, 18, 16, 21]

export function FiguresSection() {
  return (
    <Group
      id="figures"
      title="Stat, Meter, Sparkline"
      description="Keylines carry layer or tone; units, notes, deltas, meters and trends sit inside."
    >
      <div className="rx-stats">
        <Stat
          label="Height"
          value="2,569,992"
          layer="core"
          source={STAMPS.dapi}
          note="ChainLocked 12 s ago"
        />
        <Stat
          label="Platform"
          value="468,952"
          layer="platform"
          source={STAMPS.proof}
          note="Epoch 88"
        />
        <Stat
          label="Masternodes"
          value="2,207"
          layer="network"
          delta={{ value: -34, period: 'since yesterday', goodWhen: 'up' }}
        />
        <Stat
          label="Answering"
          value="99.1%"
          tone="good"
          note="2,187 of 2,207 enabled"
          meter={{ value: 2187, max: 2207 }}
        />
        <Stat label="Quorum-ready" value="82.0%" tone="warn" note="398 fail a check" />
        <Stat label="PoSe-banned" value="790" tone="bad" note="Registered, not enabled" />
        <Stat
          label="Balance"
          value="10.1333"
          unit="DASH"
          layer="platform"
          size="lg"
          source={STAMPS.proof}
        />
        <Stat
          label="Evonodes"
          value="371"
          layer="network"
          delta={{ value: 14, period: 'this week', goodWhen: 'up' }}
          spark={SPARK}
        />
        <Stat
          label="Fees"
          value="0.0198"
          unit="mDASH"
          delta={{ value: 3, period: 'today', goodWhen: 'down' }}
          href="#figures"
        />
        <Stat label="Loading" value="" loading layer="core" />
        <Stat label="Neutral" value="42" delta={{ value: 5, period: 'this week' }} />
      </div>
      <div className="rx-grid mt-4">
        <div className="rx-c4">
          <Card title="Live value">
            <Ticking />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Meter" layer="platform">
            <div className="grid gap-5">
              <Meter label="Epoch 88" value={18} max={100} format={(v) => `${v}% through`} />
              <Meter
                label="Readiness"
                value={82}
                max={100}
                format={(v) => `${v}%`}
                thresholds={[
                  { at: 0, tone: 'danger' },
                  { at: 50, tone: 'warning' },
                  { at: 80, tone: 'success' },
                ]}
                marker={{ at: 80, label: 'Target 80%' }}
              />
              <Meter
                label="Rewards"
                value={70}
                max={100}
                thresholds={[{ at: 0, tone: 'warning' }]}
              />
            </div>
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="Sparkline" layer="core">
            <div className="grid gap-4">
              <Sparkline
                values={SPARK}
                label="Blocks per hour, last 12 hours"
                layer="core"
                highlightLast
              />
              <Sparkline
                values={SPARK}
                label="Transitions per hour"
                layer="platform"
                width={160}
                height={28}
              />
              <Sparkline values={[3, 3, 3, 3]} label="Flat series" layer="network" highlightLast />
            </div>
          </Card>
        </div>
      </div>
      <div className="rx-grid mt-4">
        <div className="rx-c6">
          <Card title="Stack bar and legend" layer="network">
            <div className="rx-stack" role="img" aria-label="Status of 2,997 masternodes">
              <i style={{ flex: 2187, background: 'var(--dh-good)' }} />
              <i style={{ flex: 20, background: 'var(--dh-warn)' }} />
              <i style={{ flex: 790, background: 'var(--dh-bad)' }} />
            </div>
            <ul className="rx-legend">
              <li>
                <span className="rx-sw" style={{ ['--c' as string]: 'var(--dh-good)' }} />
                Enabled, answering <b>2,187</b>
              </li>
              <li>
                <span className="rx-sw" style={{ ['--c' as string]: 'var(--dh-warn)' }} />
                Enabled, no answer <b>20</b>
              </li>
              <li>
                <span className="rx-sw" style={{ ['--c' as string]: 'var(--dh-bad)' }} />
                PoSe-banned <b>790</b>
              </li>
            </ul>
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Bars" layer="platform">
            <div className="rx-bars" role="img" aria-label="Transitions per day, last 30 days">
              {SPARK.concat(SPARK, SPARK.slice(0, 6)).map((v, i) => (
                <i key={i} className={i > 28 ? 'dim' : undefined} style={{ height: `${v * 4}%` }} />
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div className="rx-plate mt-4 rounded-3 p-5">
        <div className="rx-stats">
          <Stat
            label="Answering"
            value="99.1%"
            tone="good"
            note="2,187 of 2,207 enabled"
            meter={{ value: 2187, max: 2207 }}
          />
          <Stat label="Evonodes" value="371" layer="network" note="363 enabled · run Platform" />
          <Stat label="Quorum-ready" value="1,809" tone="warn" note="398 fail a check" />
          <Stat label="Countries" value="40" note="91 hosting providers" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Meter label="Plate meter" value={64} max={100} format={(v) => `${v}%`} />
          <div className="flex flex-wrap items-center gap-3">
            <TypeBadge type="pro-reg" />
            <TypeBadge type="masternode-vote" />
            <Badge tone="success">Answering</Badge>
            <EntityChip kind="masternode" id={IDS.protx} label="188.40.163.5:9999" />
          </div>
        </div>
      </div>
    </Group>
  )
}

const UNITS_DEMO = [
  { v: 5_000_607_499n, label: 'DASH, prose' },
  { v: 3_692_100_000_000n, label: 'DASH, whole' },
  { v: 666n, label: 'Small fee' },
]

export function AmountSection() {
  return (
    <Group
      id="amount"
      title="Amount and Time"
      description="Exact integer maths; units, signs, compacting and fiat to three significant figures."
    >
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: false }}>
        <div className="rx-grid">
          <div className="rx-c6">
            <Card title="Amount">
              {UNITS_DEMO.map((d) => (
                <Row key={d.label} label={d.label}>
                  <Amount value={d.v} kind="duffs" />
                </Row>
              ))}
              <Row label="With fiat">
                <Amount value={5_000_607_499n} kind="duffs" fiat />
              </Row>
              <Row label="Signed">
                <Amount value={139_160_000n} kind="duffs" signed />
                <Amount value={-50_000_000n} kind="duffs" signed />
              </Row>
              <Row label="Compact">
                <Amount value={120_000_000_000n} kind="duffs" compact />
                <Amount value={1_266_000_000_000_000n} kind="duffs" compact />
              </Row>
              <Row label="Credits">
                <Amount value={1_013_331_591_984n} kind="credits" />
                <Amount value={74_600_000n} kind="credits" unit="mDASH" />
              </Row>
              <Row label="Other units">
                <Amount value={250_000_000n} kind="duffs" unit="mDASH" />
                <Amount value={250n} kind="duffs" unit="uDASH" />
                <Amount value={250n} kind="duffs" unit="duffs" />
              </Row>
              <Row label="Token">
                <Amount value={1_500_000n} kind={{ token: { decimals: 6, symbol: 'DUSD' } }} />
              </Row>
            </Card>
          </div>
          <div className="rx-c6">
            <Card title="Testnet and time">
              <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: true }}>
                <Row label="Testnet">
                  <Amount value={100_000_000n} kind="duffs" fiat />
                  <span className="rx-tnbadge">Testnet</span>
                </Row>
              </UnitsProvider>
              <Row label="Relative">
                <Time ms={NOW - 21_000} />
                <Time ms={NOW - 8 * 60_000} />
                <Time ms={NOW - 2 * 3_600_000} />
                <Time ms={NOW - 30 * 3_600_000} />
                <Time ms={NOW - 5 * 86_400_000} />
              </Row>
              <Row label="Absolute">
                <Time ms={NOW - 20 * 60_000} mode="absolute" />
                <Time ms={NOW - 9 * 86_400_000} mode="absolute" />
              </Row>
              <Row label="Both, live">
                <Time ms={NOW - 2 * 60_000} mode="both" live />
              </Row>
            </Card>
          </div>
        </div>
      </UnitsProvider>
    </Group>
  )
}

export function EntitySection() {
  return (
    <Group
      id="entities"
      title="Hash, Copy, EntityChip"
      description="Glyphs by kind; hover or focus a chip for its card; copy confirms with a check and a live-region message."
    >
      <div className="rx-grid">
        <div className="rx-c6">
          <Card title="Hash">
            <Row label="Short">
              <Hash value={IDS.tx} />
            </Row>
            <Row label="Short, no copy">
              <Hash value={IDS.tx} copy={false} />
            </Row>
            <Row label="Full">
              <Hash value={IDS.tx} display="full" />
            </Row>
            <Row label="Wrap">
              <div className="max-w-[360px]">
                <Hash value={IDS.block} display="wrap" />
              </div>
            </Row>
            <Row label="Copy">
              <Copy value="Radar" label="Copy the word Radar" />
            </Row>
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Art" layer="platform">
            <Row label="Identicons">
              {[18, 28, 48, 64].map((s) => (
                <Identicon key={s} id={IDS.identity} size={s} />
              ))}
              <Identicon id={IDS.identity2} size={48} />
            </Row>
            <Row label="Nodeprints">
              {[18, 28, 60].map((s) => (
                <Nodeprint key={s} id={IDS.protx} size={s} />
              ))}
              <Nodeprint id={IDS.evo} evonode size={60} />
            </Row>
            <Row label="Layer tiles">
              <LayerTile layer="core" icon="block" size={44} />
              <LayerTile layer="platform" icon="doc" size={44} />
              <LayerTile layer="network" icon="node" size={44} />
              <LayerTile layer="neutral" icon="radar" size={44} />
              <LayerGlyph layer="core" icon="tx" />
              <LayerGlyph layer="platform" icon="contract" />
            </Row>
          </Card>
        </div>
        <div className="rx-c12">
          <Card title="Every kind" subtitle="md, hover card on">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {CHIP_SAMPLES.map((c, i) => (
                <Row key={i} label={KIND_META[c.kind].label}>
                  <EntityChip kind={c.kind} id={c.id} label={c.label} href="#entities" />
                </Row>
              ))}
            </div>
          </Card>
        </div>
        <div className="rx-c12">
          <Card title="Chip options">
            <Row label="sm">
              <EntityChip
                kind="identity"
                id={IDS.identity}
                label="pshenmic.dash"
                href="#entities"
                size="sm"
              />
              <EntityChip
                kind="masternode"
                id={IDS.protx}
                label="188.40.163.5:9999"
                href="#entities"
                size="sm"
              />
              <EntityChip kind="block" id="2569992" href="#entities" size="sm" />
            </Row>
            <Row label="No copy">
              <EntityChip kind="tx" id={IDS.tx} href="#entities" copy={false} />
            </Row>
            <Row label="No hover card">
              <EntityChip kind="address" id={IDS.address} href="#entities" hover={false} />
            </Row>
            <Row label="No link">
              <EntityChip kind="contract" id={IDS.contract} label="DPNS" href={false} />
            </Row>
            <Row label="Glyph square instead of identicon">
              <EntityChip
                kind="identity"
                id={IDS.identity}
                label="pshenmic.dash"
                href="#entities"
                identicon={false}
              />
            </Row>
          </Card>
        </div>
      </div>
    </Group>
  )
}

const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const

export function BadgeSection() {
  return (
    <Group
      id="badges"
      title="Badge and TypeBadge"
      description="A type badge takes the layer the type touches."
    >
      <div className="rx-grid">
        <div className="rx-c4">
          <Card title="Badge">
            <Row label="md">
              {TONES.map((t) => (
                <Badge key={t} tone={t}>
                  {t}
                </Badge>
              ))}
            </Row>
            <Row label="sm">
              {TONES.map((t) => (
                <Badge key={t} tone={t} size="sm">
                  {t}
                </Badge>
              ))}
            </Row>
            <Row label="With icon">
              <Badge tone="success" icon={<Icon name="check" size="sm" />}>
                Executed
              </Badge>
              <Badge tone="danger" icon={<Icon name="alert" size="sm" />}>
                Failed
              </Badge>
            </Row>
          </Card>
        </div>
        <div className="rx-c8">
          <Card title="TypeBadge">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Group>
  )
}

const CHART_OPTION = {
  grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
  xAxis: { type: 'category', data: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'] },
  yAxis: { type: 'value' },
  tooltip: { trigger: 'axis' },
  series: [{ type: 'bar', data: [12, 18, 14, 22, 26, 20, 31, 28] }],
} as const

const LINE_OPTION = {
  grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
  xAxis: { type: 'category', data: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'] },
  yAxis: { type: 'value' },
  tooltip: { trigger: 'axis' },
  series: [{ type: 'line', areaStyle: {}, data: [12, 18, 14, 22, 26, 20, 31, 28] }],
} as const

const CHART_TABLE = {
  columns: ['Month', 'Transitions'],
  rows: [
    ['Sep', 12],
    ['Oct', 18],
    ['Nov', 14],
    ['Dec', 22],
    ['Jan', 26],
    ['Feb', 20],
    ['Mar', 31],
    ['Apr', 28],
  ],
}

export function ChartSection() {
  return (
    <Group
      id="charts"
      title="Chart"
      description="ECharts loads on demand; legends and axis titles are HTML around it; the table is the accessible equivalent."
    >
      <div className="rx-grid">
        <div className="rx-c6">
          <Card title="Transitions per month" layer="platform" source={STAMPS.pe}>
            <Chart
              option={CHART_OPTION as never}
              height={200}
              label="Transitions per month, September to April"
              table={CHART_TABLE}
              group="kit"
            />
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Blocks per month" layer="core" source={STAMPS.dapi}>
            <Chart
              option={LINE_OPTION as never}
              height={200}
              label="Blocks per month, September to April"
              table={CHART_TABLE}
              group="kit"
            />
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Loading chart" layer="network">
            <Chart
              option={{}}
              height={200}
              label="Loading"
              table={{ columns: [], rows: [] }}
              loading
            />
          </Card>
        </div>
      </div>
    </Group>
  )
}

const MARKS: [string, (typeof STAMPS)[keyof typeof STAMPS]][] = [
  ['sdk, proved', STAMPS.proof],
  ['sdk, not proved', STAMPS.notProved],
  ['sdk-cold', STAMPS.sdkCold],
  ['dapi', STAMPS.dapi],
  ['radar', STAMPS.radar],
  ['pe', STAMPS.pe],
  ['hyphen', STAMPS.hyphen],
  ['hyphen, stale', STAMPS.hyphenStale],
  ['hyphen, DAPI busy', STAMPS.hyphenBusy],
  ['hyphen, DAPI unreachable', STAMPS.hyphenDown],
  ['local', STAMPS.local],
  ['rate', STAMPS.rate],
  ['immutable', STAMPS.immutable],
]

export function SourceSection() {
  const [paused, setPaused] = useState(false)
  return (
    <Group
      id="sources"
      title="SourceLine, LiveDot, live control"
      description="Where a figure came from and how old it is."
    >
      <div className="rx-grid">
        <div className="rx-c8">
          <Card title="Source marks">
            {MARKS.map(([label, s]) => (
              <Row key={label} label={label}>
                <SourceLine stamp={s} compact />
              </Row>
            ))}
            <DownSource>
              <Row label="rate, down">
                <SourceLine stamp={STAMPS.rateDown} compact />
              </Row>
            </DownSource>
            <Row label="Joined">
              <SourceLine stamp={[STAMPS.dapi, STAMPS.radar]} compact />
            </Row>
            <Row label="Not compact">
              <SourceLine stamp={[STAMPS.radar, STAMPS.dapi]} />
            </Row>
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="LiveDot">
            {(['live', 'ok', 'slow', 'degraded', 'stale', 'down', 'unknown'] as const).map((s) => (
              <Row key={s} label={s}>
                <LiveDot state={s} />
              </Row>
            ))}
          </Card>
          <div className="h-4" />
          <Card title="Live and pause">
            <Row label="Live">
              <LiveControl
                paused={paused}
                newCount={4}
                onToggle={() => {
                  setPaused((p) => !p)
                }}
              />
            </Row>
            <Row label="Paused">
              <LiveControl paused newCount={4} onToggle={() => undefined} />
            </Row>
          </Card>
        </div>
      </div>
    </Group>
  )
}

const SKELETONS: SkeletonProps[] = [
  { shape: 'line', count: 4 },
  { shape: 'block', height: 80 },
  { shape: 'stat' },
  { shape: 'row', count: 3 },
  { shape: 'chip' },
  { shape: 'chart', height: 120 },
]

export function StateSection() {
  return (
    <Group
      id="states"
      title="Empty, ErrorState, Skeleton"
      description="Every state a card or list body can be in."
    >
      <div className="rx-grid">
        <div className="rx-c4">
          <Card title="none-yet" layer="platform">
            <Empty
              kind="none-yet"
              title="No transitions yet"
              body="This identity was created but hasn't signed anything since."
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="no-match" layer="network">
            <Empty
              kind="no-match"
              title="Nothing matches these filters"
              body="Try removing a filter."
              action={
                <button type="button" className="dh-btn dh-btn--sm">
                  Clear filters
                </button>
              }
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="not-found" layer="core">
            <Empty
              kind="not-found"
              title="Not found on Mainnet"
              body="No block with this hash on mainnet."
              action={
                <a className="rx-go" href="#states">
                  Found on Testnet
                </a>
              }
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="unsupported-network">
            <Empty
              kind="unsupported-network"
              title="Testnet doesn't have this yet"
              body="Platform Explorer doesn't index devnets."
              action={
                <a className="rx-go" href="#states">
                  Open on Mainnet
                </a>
              }
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="blocked">
            <Empty
              kind="blocked"
              title="Hidden by the operator"
              body="Hyphen's testnet index stopped at block 1,577,999 on 23 Oct."
              action={
                <a className="rx-go" href="#states">
                  Read the policy
                </a>
              }
            />
          </Card>
        </div>
        <div className="rx-c4">
          <Card title="ErrorState" layer="platform">
            <ErrorState
              error={new SourceError('pe', 'network', 'fetch failed')}
              onRetry={() => undefined}
            />
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Error kinds">
            <ErrorState
              error={new SourceError('dapi', 'rate-limited', 'busy')}
              compact
              onRetry={() => undefined}
            />
            <ErrorState error={new SourceError('radar', 'invalid-response', 'zod')} compact />
            <ErrorState error={new SourceError('sdk', 'proof-failed', 'bad proof')} compact />
            <ErrorState error={new Error('boom')} compact onRetry={() => undefined} />
          </Card>
        </div>
        <div className="rx-c6">
          <Card title="Skeletons">
            <div className="grid gap-5">
              {SKELETONS.map((s) => (
                <div key={s.shape}>
                  <p className="m-0 mb-2 text-[12px] text-ink-2">{s.shape}</p>
                  <Skeleton {...s} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Group>
  )
}

export function LinkOutSection() {
  return (
    <Group
      id="linkouts"
      title="LinkOut"
      description="Radar never asks for keys. Actions leave through a secondary link-out."
    >
      <Row>
        <LinkOut to={{ app: 'gov', action: 'proposal', hash: 'a1b2' }}>Vote in Governance</LinkOut>
        <LinkOut to={{ app: 'bridge', action: 'identity', id: IDS.identity, net: 'mainnet' }}>
          Manage in Bridge
        </LinkOut>
        <LinkOut to={{ app: 'pe', path: '/identity/x', net: 'mainnet' }}>Platform Explorer</LinkOut>
        <LinkOut to={{ app: 'hyphen', path: '/address/x', net: 'mainnet' }}>Hyphen</LinkOut>
        <LinkOut to={{ app: 'insight', path: '/tx/x', net: 'mainnet' }} />
      </Row>
      <div className="rx-grid mt-3">
        <div className="rx-c6">
          <LinkOutCard
            to={{ app: 'gov', action: 'proposal', hash: 'a1b2' }}
            title="Governance"
            description="Vote on proposals and contested usernames."
          />
        </div>
        <div className="rx-c6">
          <LinkOutCard
            to={{ app: 'bridge', action: 'identity', id: IDS.identity, net: 'mainnet' }}
            title="Bridge"
            description="Create and fund identities, register names."
          />
        </div>
      </div>
    </Group>
  )
}
