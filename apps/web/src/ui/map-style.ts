/** MapLibre style values for Radar's plate map (docs/RADAR-DESIGN.md §8). Same in both themes except the ocean. */
export const RADAR_MAP_STYLE = {
  ocean: { light: '#0A2A3D', dark: '#0D3149' },
  land: '#16435F',
  borderLine: {
    color: 'rgba(166,216,247,.28)',
    widthAtZoom: [
      [2, 0.7],
      [8, 1.4],
    ] as const,
  },
  stateLine: { color: 'rgba(166,216,247,.14)', width: 0.6 },
  label: {
    color: '#9BBDD2',
    haloColor: '#16435F',
    haloWidth: 1.2,
    haloOpacity: { countries: 0.85, cities: 0.7 },
  },
  masternode: { color: '#A6D8F7', stroke: 'plate', strokeWidth: 1 },
  evonode: { color: '#25B8A6', stroke: 'plate', strokeWidth: 1 },
  selected: { ringColor: '#E4F3FC', ringWidth: 2, haloWidth: 8, haloOpacity: 0.25 },
  cluster: { minSize: 28, maxSize: 56, countFontSize: 12, countFontWeight: 650 },
  ping: { rings: 3, durationMs: 2400 },
  sources: {
    lowZoomBelow: 3.2,
    low: 'world-low.json',
    high: 'world-high.json',
  },
} as const
