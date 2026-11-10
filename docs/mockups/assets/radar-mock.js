/* Mockup behaviour only: draws the plate maps, ties the two block lanes, ticks ages, simulates new blocks on the
   home page, opens hover cards, copies, and wires the keyboard (/, ⌘K, j/k, Esc). ?static freezes everything
   (screenshots); ?testnet shows the testnet frame. Production builds these as React components (RADAR-DESIGN.md). */
(() => {
  const q = new URLSearchParams(location.search);
  const STATIC = q.has('static');
  const NOW0 = 1794321030;
  const t0 = Date.now();
  const now = () => (STATIC ? NOW0 : NOW0 + Math.floor((Date.now() - t0) / 1000));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (x) => x.toLocaleString('en-US');

  if (q.has('testnet')) {
    document.documentElement.classList.add('rx-testnet');
    const bar = $('dashhq-bar');
    if (bar) bar.setAttribute('network', 'testnet');
    document.querySelectorAll('[data-net]').forEach((el) => { el.className = 'rx-tnbadge'; el.textContent = 'Testnet'; });
  }

  // ---------------------------------------------------------------- Equal Earth, same as the generator
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  function proj(lon, lat) {
    const l = (lon * Math.PI) / 180, t = Math.asin(M * Math.sin((lat * Math.PI) / 180)), t2 = t * t, t6 = t2 * t2 * t2;
    const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
    const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
    return [((x + 2.7064) / 5.4128) * 1000, ((1.3173 - y) / 2.6346) * 487 - window.RX_MAP.top];
  }
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function drawMap(svg) {
    const D = window.RX_MAP; if (!D) return;
    svg.setAttribute('viewBox', svg.dataset.crop || `0 0 ${D.vb[0]} ${D.vb[1]}`);
    el('path', { class: 'land', d: D.land }, svg);
    const g = el('g', {}, svg);
    const k = +(svg.dataset.scale || 1);
    for (const c of D.nodes) {
      const r = (2 + Math.sqrt(c.n) * 0.85) * k;
      el('circle', { class: 'mn', cx: c.x, cy: c.y, r: r.toFixed(2) }, g);
      if (c.evo) el('circle', { class: 'evo', cx: c.x, cy: c.y, r: (r * Math.sqrt(c.evo / c.n)).toFixed(2) }, g);
    }
    const pings = svg.dataset.pings ? JSON.parse(svg.dataset.pings) : [];
    for (const p of pings) ping(svg, p.lat, p.lon, p.kind, true);
    if (svg.dataset.focus) {
      const [lat, lon] = svg.dataset.focus.split(',').map(Number);
      const [x, y] = proj(lon, lat);
      const f = Math.max(k, .6);
      el('circle', { cx: x, cy: y, r: 14 * f, fill: 'none', stroke: '#5EC2F6', 'stroke-width': 1.5 * f, 'stroke-opacity': .6 }, svg);
      el('circle', { cx: x, cy: y, r: 7 * f, fill: 'none', stroke: '#5EC2F6', 'stroke-width': 2 * f }, svg);
      el('circle', { cx: x, cy: y, r: 3.2 * f, class: 'hit' }, svg);
    }
  }
  function ping(svg, lat, lon, kind, frozen) {
    const [x, y] = proj(lon, lat);
    const cls = kind === 'plat' ? 'ping ping--plat' : 'ping ping--core';
    if (frozen) {
      el('circle', { class: cls, cx: x, cy: y, r: 22, 'stroke-opacity': .25 }, svg);
      el('circle', { class: cls, cx: x, cy: y, r: 14, 'stroke-opacity': .55 }, svg);
      el('circle', { class: cls, cx: x, cy: y, r: 7, 'stroke-opacity': 1, 'stroke-width': 2.2 }, svg);
    } else {
      const c = el('circle', { class: cls + ' is-live', cx: x, cy: y, r: 6 }, svg);
      setTimeout(() => c.remove(), 2600);
    }
    el('circle', { class: kind === 'plat' ? 'hit hit--plat' : 'hit', cx: x, cy: y, r: 3 }, svg);
  }
  $$('svg[data-rx-map]').forEach(drawMap);

  // ---------------------------------------------------------------- the two-lane chain: tie each Platform block to its Core block
  function ties() {
    const box = $('.rx-lanes__body'), svg = $('.rx-ties');
    if (!box || !svg || getComputedStyle(svg).display === 'none') return;
    svg.innerHTML = '';
    const ob = svg.getBoundingClientRect();
    const core = new Map($$('#lane-core .rx-blk').map((b) => [b.dataset.h, b]));
    for (const p of $$('#lane-plat .rx-blk')) {
      const c = core.get(p.dataset.locked); if (!c) continue;
      const a = p.getBoundingClientRect(), b = c.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - ob.left, y1 = a.top - ob.top, x2 = b.left + b.width / 2 - ob.left, y2 = b.bottom - ob.top;
      const my = (y1 + y2) / 2;
      el('path', { d: `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` }, svg);
    }
  }
  ties(); addEventListener('resize', ties);
  document.fonts && document.fonts.ready.then(ties);

  // ---------------------------------------------------------------- relative ages
  const ago = (t) => {
    const s = Math.max(0, now() - t);
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 172800) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
  };
  function tickAges() { $$('[data-t]').forEach((e) => { const v = ago(+e.dataset.t); if (e.textContent !== v) e.textContent = v; }); }

  // ---------------------------------------------------------------- live simulation (home only)
  let paused = false;
  $$('.rx-live button').forEach((b) => b.addEventListener('click', () => {
    paused = !paused;
    const live = b.closest('.rx-live'); live.classList.toggle('is-paused', paused);
    live.querySelector('.rx-live__word').textContent = paused ? 'Paused' : 'Live';
    b.setAttribute('aria-label', paused ? 'Resume live updates' : 'Pause live updates');
    b.innerHTML = `<svg class="rx-ico rx-ico--sm" aria-hidden="true"><use href="#i-${paused ? 'play' : 'pause'}"/></svg>`;
  }));
  const map = $('.rx-scope svg[data-rx-map]');
  const spots = [[50.48, 12.37, 'Falkenstein, DE'], [60.17, 24.94, 'Helsinki, FI'], [1.29, 103.85, 'Singapore, SG'], [52.37, 4.9, 'Amsterdam, NL'],
    [51.51, -0.13, 'London, GB'], [40.71, -74.0, 'New York, US'], [49.45, 11.08, 'Nuremberg, DE'], [51.1, 17.03, 'Wrocław, PL']];
  let coreH = 2569992, platH = 468952;
  function landCore() {
    coreH++;
    const lane = $('#lane-core');
    if (lane) {
      const first = lane.firstElementChild; first.remove();
      const tip = lane.querySelector('.is-tip'); tip && tip.classList.remove('is-tip');
      const a = document.createElement('a');
      a.className = 'rx-blk is-tip is-new'; a.href = '#'; a.dataset.layer = 'core'; a.dataset.h = coreH;
      a.innerHTML = `<b>${fmt(coreH)}</b><span>${20 + (coreH % 70)} tx · <span data-t="${now()}">0 s</span></span><svg class="rx-ico rx-lock" aria-hidden="true"><use href="#i-cl"/></svg>`;
      lane.appendChild(a);
    }
    $$('[data-tip="core"]').forEach((e) => { e.textContent = fmt(coreH); e.classList.remove('is-new'); void e.offsetWidth; e.classList.add('is-new'); });
    const body = $('#feed-core');
    if (body) {
      const tr = body.rows[0].cloneNode(true);
      tr.className = 'rx-enter';
      tr.querySelector('.rx-chip__name').textContent = fmt(coreH);
      const tc = tr.querySelector('[data-t]'); tc.dataset.t = now(); tc.textContent = '0 s';
      body.prepend(tr); body.rows[body.rows.length - 1].remove();
      [...body.rows].slice(1).forEach((r) => r.classList.remove('rx-just', 'rx-enter'));
    }
    const s = spots[coreH % spots.length];
    if (map) ping(map, s[0], s[1], 'core', false);
    const call = $('#callout-core');
    if (call) { call.querySelector('b').textContent = `Block ${fmt(coreH)}`; call.querySelector('span').textContent = `Paid a masternode in ${s[2]}`; }
    $$('.rx-fresh').forEach((f) => { f.classList.remove('is-pulse'); void f.offsetWidth; f.classList.add('is-pulse'); });
    ties();
  }
  function landPlat() {
    platH++;
    const lane = $('#lane-plat');
    if (lane) {
      lane.firstElementChild.remove();
      const tip = lane.querySelector('.is-tip'); tip && tip.classList.remove('is-tip');
      const a = document.createElement('a');
      a.className = 'rx-blk is-tip is-new rx-blk--empty'; a.href = '#'; a.dataset.layer = 'platform'; a.dataset.locked = coreH;
      a.innerHTML = `<b>${fmt(platH)}</b><span>0 tx · <span data-t="${now()}">0 s</span></span>`;
      lane.appendChild(a);
    }
    $$('[data-tip="plat"]').forEach((e) => { e.textContent = fmt(platH); e.classList.remove('is-new'); void e.offsetWidth; e.classList.add('is-new'); });
    const s = spots[(platH * 3) % spots.length];
    if (map) ping(map, s[0], s[1], 'plat', false);
    ties();
  }
  if (!STATIC) {
    setInterval(tickAges, 1000);
    if ($('.rx-scope')) {
      setInterval(() => { if (!paused) landCore(); }, 14000);
      setInterval(() => { if (!paused) landPlat(); }, 9000);
    }
  }

  // ---------------------------------------------------------------- hover cards (X-06)
  const ico = (n) => `<svg class="rx-ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const CARDS = {
    mn: (a) => ({ layer: 'network', kind: a.dataset.kind || 'Masternode', title: a.dataset.title || a.textContent.trim(),
      glyph: (a.querySelector('.rx-np') || a.closest('tr')?.querySelector('.rx-np'))?.outerHTML || '',
      id: a.dataset.protx || '',
      kv: [['Status', a.dataset.ok === '0' ? '<span class="rx-st rx-st--warn">No answer · enabled</span>' : '<span class="rx-st rx-st--good">Answering · enabled</span>'],
        ['Version', `<span class="rx-mono">${a.dataset.ver || '24.0.0'}</span>`], ['Uptime, 30 d', a.dataset.up || '100%'], ['Last paid', a.dataset.paid || '']],
      src: `<span class="rx-src">${ico('radar')}Crawled by Radar<time>13 min ago</time></span>`, go: 'Open masternode' }),
    id: (a) => ({ layer: 'platform', kind: 'Identity', title: 'pshenmic<span class="rx-tld">.dash</span>', glyph: a.querySelector('.rx-idc')?.outerHTML.replace(/--s:\d+px/, '--s:36px') || '',
      id: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
      kv: [['Balance', '10.1333 DASH <span class="rx-fiat">≈ $468</span>'], ['Names', 'pshenmic.dash, cryptofan.dash'], ['Keys', '6 · 1 master'], ['Transitions', '22']],
      src: `<span class="rx-src rx-src--proof">${ico('proof')}Proof-checked<time>just now</time></span>`, go: 'Open identity' }),
    block: (a) => ({ layer: 'core', kind: 'Core block', title: 'Block ' + (a.querySelector('b,.rx-chip__name')?.textContent || ''), glyph: `<span class="rx-tile" data-layer="core" style="--s:36px">${ico('block')}</span>`,
      id: '000000000000001ba106dbf586a6d6e54c3c077a5fc894960896a83b4bda525c',
      kv: [['Mined', '10 Nov 2026, 14:28 UTC'], ['Transactions', '85 · 68.9 kB'], ['ChainLock', '<span class="rx-st rx-st--good">Locked</span>'], ['Paid to', '45.32.107.227 · Singapore']],
      src: `<span class="rx-src">${ico('dapi')}Served by DAPI<time>2 s ago</time></span>`, go: 'Open block' }),
    tx: () => ({ layer: 'core', kind: 'Core transaction', title: 'Transaction', glyph: `<span class="rx-tile" data-layer="core" style="--s:36px">${ico('tx')}</span>`,
      id: 'cb4c0d655f15ba97aa1a8e71f746db6fd15530df83d6d355396620705f5bcdf0',
      kv: [['Moved', '50.0061 DASH'], ['In block', '2,569,992 · InstantSend and ChainLock'], ['Inputs, outputs', '4 → 2']],
      src: `<span class="rx-src">${ico('dapi')}Served by DAPI<time>2 s ago</time></span>`, go: 'Open transaction' }),
    ptx: () => ({ layer: 'platform', kind: 'State transition', title: 'Document replace', glyph: `<span class="rx-tile" data-layer="platform" style="--s:36px">${ico('doc')}</span>`,
      id: 'BB82CB1BF8D2C1A7E54B4F0C6E3A0A5D7F0C2B9E1D4A6C8B0E2F4A6C8E0B2D4F',
      kv: [['Block', '468,946 · locked to Core 2,569,990'], ['Owner', '7P3ZsJ…Tn9J'], ['Fee', '0.0198 mDASH'], ['Status', '<span class="rx-st rx-st--good">Executed</span>']],
      src: `<span class="rx-src">${ico('index')}Indexed by Platform Explorer<time>12 s ago</time></span>`, go: 'Open transition' }),
    addr: (a) => ({ layer: 'core', kind: 'Core address', title: a.textContent.trim(), glyph: `<span class="rx-tile" data-layer="core" style="--s:36px">${ico('addr')}</span>`,
      id: 'XtNfacxAyGM1qfmTifGgLL1Q7JxX7pGXck',
      kv: [['Balance', '0.0061 DASH'], ['Received', '1,250.0000 DASH'], ['Transactions', '214'], ['First seen', '3 Mar 2024']],
      src: `<span class="rx-src">${ico('index')}Indexed by Hyphen<time>8 s ago</time></span>`, go: 'Open address' }),
  };
  let hc = null, hcFor = null, hcTimer = 0;
  function showCard(a) {
    const f = CARDS[a.dataset.hc]; if (!f) return;
    const c = f(a);
    hideCard();
    hc = document.createElement('div');
    hc.className = 'rx-hc'; hc.dataset.layer = c.layer; hc.setAttribute('role', 'dialog'); hc.setAttribute('aria-label', c.kind + ' preview');
    hc.innerHTML = `<div class="rx-hc__head">${c.glyph.replace(/--s:\d+px/, '--s:36px')}<div><div class="rx-hc__kind">${c.kind}</div><div class="rx-hc__title">${c.title}</div></div></div>
      <p class="rx-hc__id">${c.id}</p>
      <dl class="dh-kv">${c.kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="rx-hc__foot">${c.src}<a class="rx-go" href="${a.getAttribute('href')}">${c.go}</a></div>`;
    document.body.appendChild(hc);
    const r = a.getBoundingClientRect();
    let x = r.left + scrollX, y = r.bottom + scrollY + 8;
    const w = hc.offsetWidth;
    if (x + w > scrollX + innerWidth - 12) x = scrollX + innerWidth - 12 - w;
    hc.style.left = Math.max(12, x) + 'px'; hc.style.top = y + 'px';
    hcFor = a;
  }
  function hideCard() { if (hc) { hc.remove(); hc = null; hcFor = null; } }
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest('[data-hc]');
    if (a && a !== hcFor && matchMedia('(hover: hover)').matches) { clearTimeout(hcTimer); hcTimer = setTimeout(() => showCard(a), 350); }
    else if (!a && !(hc && hc.contains(e.target))) { clearTimeout(hcTimer); hcTimer = setTimeout(hideCard, 200); }
  });
  document.addEventListener('focusin', (e) => { const a = e.target.closest('[data-hc]'); if (a) showCard(a); });
  const open = $('[data-hc-open]');
  if (open && matchMedia('(hover: hover) and (min-width: 900px)').matches) requestAnimationFrame(() => showCard(open));

  // ---------------------------------------------------------------- copy
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.rx-copy'); if (!b) return;
    e.preventDefault();
    navigator.clipboard?.writeText(b.dataset.copy || '').catch(() => {});
    b.classList.add('is-done'); b.innerHTML = ico('check');
    const live = $('#rx-announce'); if (live) live.textContent = 'Copied';
    setTimeout(() => { b.classList.remove('is-done'); b.innerHTML = ico(b.dataset.icon || 'copy'); }, 1400);
  });

  // ---------------------------------------------------------------- keyboard
  const onSearch = !!$('.rx-pal');
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      if (!onSearch) { e.preventDefault(); location.href = 'search.html'; }
    }
    if (onSearch && e.key === 'Escape') { location.href = 'home.html'; }
    if (onSearch && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const opts = $$('.rx-opt'); const i = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
      const j = Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === j)));
      opts[j].scrollIntoView({ block: 'nearest' });
    }
    if (!typing && (e.key === 'j' || e.key === 'k') && $('.rx-table--nav')) {
      const rows = $$('.rx-table--nav tbody tr'); const i = rows.findIndex((r) => r.classList.contains('is-focus'));
      const j = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'j' ? 1 : -1)));
      rows.forEach((r, k) => { r.classList.toggle('is-focus', k === j); r.setAttribute('aria-selected', String(k === j)); });
      rows[j].scrollIntoView({ block: 'nearest' });
    }
  });
  $$('[data-palette]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); location.href = 'search.html'; }));
  const inp = $('.rx-pal input'); if (inp && !STATIC) inp.focus();
})();
