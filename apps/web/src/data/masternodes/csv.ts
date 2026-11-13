/** A cell that would run as a spreadsheet formula: it starts with `=`, `+`, `-`, `@`, a tab or a carriage return. */
const FORMULA = /^[=+\-@\t\r]/

/** Text for a CSV cell: formulas are made inert with a leading apostrophe, then quoted if the cell needs it. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const safe = FORMULA.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export interface CsvColumn<Row> {
  header: string
  value: (row: Row) => string | number | boolean | null | undefined
}

/** The rows as CSV text with CRLF line ends, headers first. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','))
  return `${lines.join('\r\n')}\r\n`
}
