/** DPNS's own rules for a name, from the DPNS contract's `domain` schema (the same on every network). */
export {
  isContestedLabel,
  isValidLabel,
  labelOf,
  labelProblem,
  normalizeLabel,
  type LabelProblem,
} from '@/data/query/prefetch/p-vote'
