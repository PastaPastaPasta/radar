const TESTNET_HOSTS = {
  'pe.dashhq.org': 'testnet.pe.dashhq.org',
  'insight.dash.org': 'insight.testnet.networks.dash.org',
  'hy.kw.vg': 'ts.kw.vg',
}

export const PRODUCTION_HOSTS = [
  'radar.dashhq.org',
  'explorer.dashhq.org',
  'pe.dashhq.org',
  'testnet.pe.dashhq.org',
  'insight.dash.org',
  'insight.testnet.networks.dash.org',
  'hy.kw.vg',
  'ts.kw.vg',
]

export function siteOf(url) {
  const host = new URL(url).hostname
  if (host.endsWith('.localhost') || host === 'localhost') return 'radar'
  const names = {
    'radar.dashhq.org': 'radar-prod',
    'explorer.dashhq.org': 'explorer',
    'pe.dashhq.org': 'pe',
    'testnet.pe.dashhq.org': 'pe',
    'insight.dash.org': 'insight',
    'insight.testnet.networks.dash.org': 'insight',
    'hy.kw.vg': 'hyphen',
    'ts.kw.vg': 'hyphen',
  }
  return names[host] ?? host.replace(/[^a-z0-9]+/gi, '-')
}

export function productionUrl(url, network) {
  const u = new URL(url)
  if (network === 'testnet') {
    const swap = TESTNET_HOSTS[u.hostname]
    if (swap) u.hostname = swap
    else if (u.hostname === 'radar.dashhq.org') u.searchParams.set('net', 'testnet')
  }
  if (u.hostname === 'explorer.dashhq.org') u.searchParams.set('network', network)
  return u.toString()
}

export function radarUrl(base, path, network) {
  const u = new URL(path, base)
  if (network === 'testnet') u.searchParams.set('network', 'testnet')
  return u.toString()
}

export function isProduction(url) {
  return PRODUCTION_HOSTS.includes(new URL(url).hostname)
}
