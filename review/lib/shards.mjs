export const SHARDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']

export function shardOf(id) {
  const [prefix, rest] = id.split('-')
  const n = Number(rest)
  switch (prefix) {
    case 'RA':
      return 'S1'
    case 'HY':
      return n === 10 || n === 11 ? 'S1' : 'S5'
    case 'NX':
      return n <= 45 ? 'S2' : 'S3'
    case 'PE':
      return n === 34 ? 'S3' : 'S4'
    case 'IN':
      return 'S5'
    case 'X':
      return 'S6'
    default:
      throw new Error(`unknown story id prefix: ${id}`)
  }
}
