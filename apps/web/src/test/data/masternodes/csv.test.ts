import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/data/masternodes/csv'
import { mnCsvColumns, mnCsvName } from '@/data/masternodes/export'
import type { MnRow } from '@/data/masternodes/rows'

describe('csvCell', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1'])('neutralises %j', (text) => {
    expect(csvCell(text).replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('quotes what needs it and doubles the quotes', () => {
    expect(csvCell('Amazon.com, Inc.')).toBe('"Amazon.com, Inc."')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })

  it('writes nothing for an absent value and keeps numbers and booleans', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(false)).toBe('false')
  })

  it('neutralises a negative number as well, since a spreadsheet would read it as a formula', () => {
    expect(csvCell(-5)).toBe("'-5")
  })
})

describe('toCsv', () => {
  it('writes the headers, then a CRLF-ended line per row', () => {
    const text = toCsv(
      [{ a: 1, b: 'x,y' }],
      [
        { header: 'a', value: (r) => r.a },
        { header: 'b', value: (r) => r.b },
      ],
    )
    expect(text).toBe('a,b\r\n1,"x,y"\r\n')
  })
})

describe('the masternode export', () => {
  const row = {
    protx: 'ab'.repeat(32),
    type: 'evo',
    status: 'enabled',
    service: '1.2.3.4:9999',
    registration: {
      confirmedHash: 'cc',
      pubKeyOperator: 'op',
      votingAddress: 'Xv',
      platformNodeId: 'nn',
      platformHttpPort: 443,
    },
    crawl: { country: 'DE', as_org: '=cmd|calc', uptime_30d: 99.5, last_paid_height: -1 },
  } as unknown as MnRow

  it('names the file by network', () => {
    expect(mnCsvName('mainnet')).toBe('masternodes-mainnet.csv')
    expect(mnCsvName('testnet')).toBe('masternodes-testnet.csv')
  })

  it('adds the crawl’s columns only while some row has a crawl', () => {
    const dapi = mnCsvColumns(false).map((c) => c.header)
    const all = mnCsvColumns(true).map((c) => c.header)
    expect(all.slice(0, dapi.length)).toEqual(dapi)
    expect(dapi).toEqual(
      expect.arrayContaining(['protx', 'type', 'status', 'address', 'operator_key']),
    )
    expect(dapi).not.toContain('country')
    expect(all).toEqual(
      expect.arrayContaining(['country', 'hosting', 'uptime_30d', 'payout_address']),
    )
  })

  it('neutralises a hostile hosting name and leaves a missing height empty', () => {
    const [head, line] = toCsv([row], mnCsvColumns(true)).trimEnd().split('\r\n') as [
      string,
      string,
    ]
    const cells = line.split(',')
    const at = (h: string) => cells[head.split(',').indexOf(h)]
    expect(at('hosting')).toBe("'=cmd|calc")
    expect(at('last_paid_height')).toBe('')
    expect(at('country')).toBe('DE')
    expect(at('platform_node_id')).toBe('nn')
  })
})
