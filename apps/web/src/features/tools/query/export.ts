import type { DocumentDto } from '@/data/sdk/methods'
import {
  aggregateExportRows,
  formatAverage,
  serializeQueryCsv,
  serializeQueryJson,
} from './query-workspace'
import type { StatementResult } from './run'

/** A document as one flat row: its system fields, then its own properties. */
export function documentRow(d: DocumentDto): Record<string, unknown> {
  return {
    $id: d.id,
    $ownerId: d.ownerId,
    $type: d.type,
    $revision: d.revision,
    $createdAt: d.createdAt,
    $updatedAt: d.updatedAt,
    ...d.data,
  }
}

/** The rows of a result, as exported and as the table shows them. */
export function resultRows(result: StatementResult): Record<string, unknown>[] {
  switch (result.kind) {
    case 'documents':
      return result.rows.map(documentRow)
    case 'count':
      return aggregateExportRows(new Map(result.groups.map((g) => [g.key, g.count])), 'count')
    case 'sum':
      return aggregateExportRows(new Map(result.groups.map((g) => [g.key, g.sum])), 'sum')
    case 'avg':
      return aggregateExportRows(
        new Map(result.groups.map((g) => [g.key, { count: g.count, sum: g.sum }])),
        'avg',
      )
  }
}

/** The average of one group as text, or a dash when it holds no documents. */
export const averageText = (g: { sum: bigint; count: bigint }): string =>
  formatAverage(g.sum, g.count)

export const resultJson = (result: StatementResult): string =>
  serializeQueryJson(resultRows(result))

export const resultCsv = (result: StatementResult): string => serializeQueryCsv(resultRows(result))
