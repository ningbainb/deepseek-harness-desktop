/**
 * Trading Terminal (trading) skin hooks — the trusted escape hatch of the
 * v2 skin contract (x-org.linxin666.skin-center/v1alpha1), reviewed and
 * released with this repository. Loading this module executes nothing;
 * apply() owns every DOM write and registers its retraction through
 * ctx.onCleanup.
 *
 * Port of the v1 plugin effects
 * (packages/skins/trading/src/client/{index,quotes,session,refresh-scheduler}.ts):
 *  - trading chrome: the fixed title bar with live quote chips, the
 *    scrolling tape strip and the status bar, mounted on document.body
 *    exactly as v1 did; favicon (inline candle-mark SVG data URI) and the
 *    pinned document title.
 *  - live data: the same three-tier quote stack as v1 (dsh-fun-ticker
 *    same-origin proxy -> standalone public feeds) and the same session
 *    phases, driven by the same single-timer multi-cadence scheduler
 *    (quotes 30s / sessions 60s / workspaces 30s).
 *  - KNOWN DEGRADATION vs v1: the v2 hooks context has no connection
 *    facet, so the dsh-longbridge RPC tier and the workspace.list count
 *    have no transport. They take the exact v1 no-plugin degradation
 *    path: the status-bar index cells fall back to the public Tencent
 *    feed and the workspace cell stays at its dash placeholder.
 *  - one deliberate hardening over v1: pending Tencent script-tag loads
 *    are cancelled on dispose so teardown never leaks DOM nodes.
 * The class names are the css-modules hashes the compiled patches.css
 * carries.
 */

/** The product title the skin pins (captured by the shell's DocumentTitle after settle). */
const SKIN_TITLE = '交易终端 · DeepSeek 在线'

/** Quote refresh cadence (matches the fun-ticker plugin default of 30s). */
const QUOTES_REFRESH_MS = 30_000

/** Session-state refresh cadence. */
const SESSION_REFRESH_MS = 60_000

/** Workspace-count refresh cadence. */
const WORKSPACES_REFRESH_MS = 30_000

/** Title bar window buttons (decorative glyphs, aria-hidden). */
const TITLEBAR_GLYPHS = ['–', '□', '×']

/** Compiled css-modules class names (see patches.css). */
const CLS = {
  tradingTitlebar: 'nudqwq_tradingTitlebar',
  tradingTitlebarIcon: 'nudqwq_tradingTitlebarIcon',
  tradingTitlebarTitle: 'nudqwq_tradingTitlebarTitle',
  tradingTitlebarChips: 'nudqwq_tradingTitlebarChips',
  tradingTitlebarBtn: 'nudqwq_tradingTitlebarBtn',
  tradingTitlebarChip: 'nudqwq_tradingTitlebarChip',
  tradingTitlebarChipName: 'nudqwq_tradingTitlebarChipName',
  tradingTitlebarChipVal: 'nudqwq_tradingTitlebarChipVal',
  tradingTitlebarChipChg: 'nudqwq_tradingTitlebarChipChg',
  tradingTape: 'nudqwq_tradingTape',
  tradingTapeTrack: 'nudqwq_tradingTapeTrack',
  tradingTapeItem: 'nudqwq_tradingTapeItem',
  tradingTapeName: 'nudqwq_tradingTapeName',
  tradingTapePrice: 'nudqwq_tradingTapePrice',
  tradingTapeChg: 'nudqwq_tradingTapeChg',
  tradingStatusbar: 'nudqwq_tradingStatusbar',
  tradingStatusbarGroup: 'nudqwq_tradingStatusbarGroup',
  tradingStatusbarCell: 'nudqwq_tradingStatusbarCell',
  tradingStatusbarSpacer: 'nudqwq_tradingStatusbarSpacer',
  tradingStatusbarLbLabel: 'nudqwq_tradingStatusbarLbLabel',
}

/* ── quotes.ts (v1 data layer, verbatim logic) ─────────────────────────── */

/** Resolve the cn-scheme trend: red up, green down, gray flat. */
function trendOf(q) {
  if (q.changeAbs > 0) return 'up'
  if (q.changeAbs < 0) return 'down'
  if (q.changePct > 0) return 'up'
  if (q.changePct < 0) return 'down'
  return 'flat'
}

/** AbortSignal for one request; fails safe where AbortSignal.timeout is absent. */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  // Non-fatal; the fetch owns the timer for its lifetime.
  void timer
  return controller.signal
}

/** String -> finite number, or NaN. */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  if (typeof value === 'string') return Number.parseFloat(value)
  return Number.NaN
}

/**
 * Parse one v_<sym>="..." payload. Tencent splits fields on ~; the stable
 * indices used here (verified on sh/sz/hk/us families):
 *   1 name, 3 last, 4 prevClose, 30 time, 31 change, 32 changePct,
 *   33 high, 34 low.
 */
function parseTencentRow(raw) {
  const f = raw.split('~')
  if (f.length < 35) return null
  const price = toNumber(f[3])
  if (!Number.isFinite(price)) return null
  return {
    name: f[1] !== undefined && f[1] !== '' ? f[1] : f[2] ?? '',
    price,
    prevClose: toNumber(f[4]),
    change: toNumber(f[31]),
    changePct: toNumber(f[32]),
    high: toNumber(f[33]),
    low: toNumber(f[34]),
  }
}

/**
 * Load a Tencent quote batch through a script tag (qt.gtimg.cn serves
 * classic scripts, not JSONP — the response assigns v_<sym> globals).
 * trackPending registers a cancel callback so activation teardown can
 * retract a still-pending script node (v1 leaked it until the timer).
 */
function loadTencentQuotes(symbols, timeoutMs = 8000, trackPending) {
  return new Promise((resolve) => {
    if (symbols.length === 0) { resolve(new Map()); return }
    const globals = symbols.map((s) => `v_${s}`)
    let settled = false
    const script = document.createElement('script')
    let untrack
    const finish = (out) => {
      if (settled) return
      settled = true
      untrack?.()
      clearTimeout(timer)
      script.remove()
      for (const g of globals) {
        // The response globals are read before cleanup in onload; deleting
        // them here keeps the page free of skin-owned window pollution.
        try { delete window[g] } catch { /* noop */ }
      }
      resolve(out)
    }
    const timer = window.setTimeout(() => finish(new Map()), timeoutMs)
    untrack = trackPending?.(() => finish(new Map()))
    script.onload = () => {
      const out = new Map()
      for (const s of symbols) {
        const raw = window[`v_${s}`]
        if (typeof raw !== 'string') continue
        const row = parseTencentRow(raw)
        if (row !== null) out.set(s, row)
      }
      finish(out)
    }
    script.onerror = () => finish(new Map())
    script.src = `https://qt.gtimg.cn/q=${symbols.join(',')}&_t=${Date.now()}`
    document.head.append(script)
  })
}

/** Binance hosts in preference order; the public mirror has no geo gating. */
const BINANCE_ENDPOINTS = [
  'https://api.binance.com/api/v3/ticker/24hr',
  'https://data-api.binance.vision/api/v3/ticker/24hr',
]

/** Display names for the well-known pairs. */
const CRYPTO_NAMES = {
  BTCUSDT: '比特币', ETHUSDT: '以太坊', BNBUSDT: 'BNB', SOLUSDT: 'Solana',
  XRPUSDT: '瑞波币', DOGEUSDT: '狗狗币', ADAUSDT: 'Cardano', AVAXUSDT: 'Avalanche',
  LINKUSDT: 'Chainlink', LTCUSDT: '莱特币', DOTUSDT: 'Polkadot', TRXUSDT: '波场',
  SHIBUSDT: 'SHIB', TONUSDT: 'TON', BCHUSDT: 'BCH', UNIUSDT: 'Uniswap',
  ATOMUSDT: 'Cosmos', NEARUSDT: 'NEAR', APTUSDT: 'Aptos', ARBUSDT: 'Arbitrum',
  OPUSDT: 'Optimism', FILUSDT: 'Filecoin', SUIUSDT: 'SUI', PEPEUSDT: 'PEPE',
}

/**
 * Fetch 24h tickers for a crypto batch. Walks the host list until one
 * answers; an all-fail cycle resolves to an empty map.
 */
async function fetchBinanceQuotes(symbols, timeoutMs = 8000) {
  const out = new Map()
  if (symbols.length === 0) return out
  for (const endpoint of BINANCE_ENDPOINTS) {
    try {
      const response = await fetch(
        `${endpoint}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
        { signal: timeoutSignal(timeoutMs) },
      )
      if (!response.ok) continue
      const rows = await response.json()
      for (const row of rows) {
        const symbol = String(row.symbol ?? '')
        const price = toNumber(row.lastPrice)
        if (symbol === '' || !Number.isFinite(price)) continue
        out.set(symbol, {
          symbol,
          name: CRYPTO_NAMES[symbol] ?? symbol,
          price,
          changeAbs: toNumber(row.priceChange),
          changePct: toNumber(row.priceChangePercent),
          source: 'binance',
        })
      }
      if (out.size > 0) return out
    } catch {
      // Try the next host; a total failure resolves empty.
    }
  }
  return out
}

/** Frankfurter hosts in preference order (.dev is the current home). */
const FRANKFURTER_ENDPOINTS = [
  'https://api.frankfurter.dev/v1',
  'https://api.frankfurter.app/v1',
]

/** Chinese names for common currencies (fun-ticker's naming convention). */
const FX_CURRENCY_NAMES = {
  CNY: '人民币', USD: '美元', EUR: '欧元', JPY: '日元', GBP: '英镑', HKD: '港元',
  AUD: '澳元', CAD: '加元', CHF: '瑞士法郎', KRW: '韩元', SGD: '新加坡元',
  TWD: '新台币', THB: '泰铢', RUB: '卢布', INR: '卢比', BRL: '雷亚尔',
  MXN: '比索', TRY: '里拉', ZAR: '兰特', SEK: '瑞典克朗', NOK: '挪威克朗',
  DKK: '丹麦克朗', NZD: '新西兰元', CZK: '捷克克朗', PLN: '兹罗提', HUF: '福林',
}

/** ISO date (YYYY-MM-DD) of days days before date, in UTC. */
function isoDaysAgo(date, days) {
  return new Date(date.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Fetch one FX base's rates for a target list from the first host that
 * answers. Resolves { base, rates, prev } or null on total failure.
 */
async function frankfurterRates(base, targets) {
  const symbols = targets.join(',')
  const date = new Date()
  for (const endpoint of FRANKFURTER_ENDPOINTS) {
    try {
      const latestUrl = `${endpoint}/latest?base=${base}&symbols=${symbols}`
      const latestResponse = await fetch(latestUrl, { signal: timeoutSignal(8000) })
      if (!latestResponse.ok) continue
      const latest = await latestResponse.json()
      if (latest.rates === undefined) continue
      const rates = new Map()
      for (const [code, value] of Object.entries(latest.rates)) {
        const n = toNumber(value)
        if (Number.isFinite(n)) rates.set(code, n)
      }
      // Previous business-day close: walk back up to 4 days (weekends +
      // holidays) so the change cell has a reference.
      let prev = new Map()
      for (let back = 1; back <= 4 && prev.size === 0; back += 1) {
        const prevUrl = `${endpoint}/${isoDaysAgo(date, back)}?base=${base}&symbols=${symbols}`
        try {
          const prevResponse = await fetch(prevUrl, { signal: timeoutSignal(6000) })
          if (!prevResponse.ok) continue
          const prevJson = await prevResponse.json()
          prev = new Map()
          for (const [code, value] of Object.entries(prevJson.rates ?? {})) {
            const n = toNumber(value)
            if (Number.isFinite(n)) prev.set(code, n)
          }
        } catch {
          // keep walking back
        }
      }
      return { base, rates, prev }
    } catch {
      // next host
    }
  }
  return null
}

/**
 * Fetch FX pair quotes (USD/CNY grammar). Pairs are grouped by base; each
 * group is one request plus one previous-day request for the change.
 */
async function fetchFrankfurterQuotes(pairs, timeoutMs = 8000) {
  void timeoutMs
  const out = new Map()
  if (pairs.length === 0) return out
  const byBase = new Map()
  for (const pair of pairs) {
    const [base, target] = pair.split('/')
    if (base === undefined || target === undefined || base === target) continue
    const list = byBase.get(base) ?? []
    list.push(target)
    byBase.set(base, list)
  }
  const results = await Promise.all(
    [...byBase.entries()].map(([base, targets]) => frankfurterRates(base, targets)),
  )
  for (const result of results) {
    if (result === null) continue
    for (const [target, rate] of result.rates) {
      const symbol = `${result.base}/${target}`
      const prevRate = result.prev.get(target)
      const changeAbs = Number.isFinite(prevRate) && prevRate !== 0 ? rate - prevRate : 0
      const changePct = Number.isFinite(prevRate) && prevRate !== 0
        ? ((rate - prevRate) / prevRate) * 100
        : 0
      out.set(symbol, {
        symbol,
        name: `${FX_CURRENCY_NAMES[result.base] ?? result.base}/${FX_CURRENCY_NAMES[target] ?? target}`,
        price: rate,
        changeAbs,
        changePct,
        source: 'frankfurter',
      })
    }
  }
  return out
}

/** The fun-ticker plugin's same-origin API base (404s when not installed). */
const TICKER_API_BASE = '/plugins/dsh-ticker/api'

/** Read the user's fun-ticker watchlist; null when the plugin is absent. */
async function fetchTickerSettings(timeoutMs = 5000) {
  if (typeof fetch === 'undefined') return null
  try {
    const response = await fetch(`${TICKER_API_BASE}/settings`, { signal: timeoutSignal(timeoutMs) })
    if (!response.ok) return null
    const data = await response.json()
    if (data.ok !== true) return null
    const symbols = data.section?.symbols
    if (!Array.isArray(symbols)) return null
    const list = symbols.filter((s) => typeof s === 'string' && s.length > 0)
    return list.length > 0 ? list : null
  } catch {
    return null
  }
}

/** Poll the fun-ticker quote proxy for the given watchlist; null on failure. */
async function fetchTickerQuotes(symbols, timeoutMs = 8000) {
  if (typeof fetch === 'undefined' || symbols.length === 0) return null
  try {
    const response = await fetch(
      `${TICKER_API_BASE}/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
      { signal: timeoutSignal(timeoutMs) },
    )
    if (!response.ok) return null
    const data = await response.json()
    if (data.ok !== true || data.quotes === undefined) return null
    const quotes = []
    for (const row of Object.values(data.quotes)) {
      const symbol = String(row.symbol ?? '')
      const price = toNumber(row.price)
      if (symbol === '' || !Number.isFinite(price)) continue
      quotes.push({
        symbol,
        name: typeof row.name === 'string' && row.name !== '' ? row.name : symbol,
        price,
        changePct: toNumber(row.changePct),
        changeAbs: toNumber(row.changeAbs),
        source: 'ticker',
      })
    }
    return quotes.length > 0 ? quotes : null
  } catch {
    return null
  }
}

/** Skin default watchlist when dsh-fun-ticker is absent (own grammar). */
const DEFAULT_TAPE = [
  'sh000001', 'sz399001', 'sz399006',
  'hkHSI', 'hk00700', 'hk09988',
  'usIXIC', 'usDJI', 'usNVDA', 'usAAPL', 'usTSLA',
  'BTCUSDT', 'ETHUSDT', 'USD/CNY',
]

/** Status-bar HK/US fallback (tencent grammar) when longbridge is absent. */
const DEFAULT_INDEX_CELLS = ['hkHSI', 'hkHSTECH', 'usDJI', 'usINX', 'usIXIC']

/** Classify one standalone symbol into its upstream family. */
function classifyDirectSymbol(symbol) {
  const value = symbol.trim()
  if (/^(?:sh|sz|hk|us)[A-Za-z0-9.]+$/.test(value)) return 'tencent'
  // Crypto pairs must contain a letter — a bare 6-digit code is A-share
  // grammar (fun-ticker), never a crypto pair.
  if (/^(?=.*[A-Z])[A-Z0-9]{4,12}$/.test(value)) return 'crypto'
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(value)) return 'fx'
  return null
}

/**
 * Fetch a quote batch from the public feeds directly (used only when the
 * fun-ticker plugin is not installed). Every family failure degrades to an
 * empty slice; the merged result may be shorter than requested.
 */
async function fetchDirectQuotes(symbols, timeoutMs = 8000, trackPending) {
  const tencentSymbols = []
  const cryptoSymbols = []
  const fxSymbols = []
  for (const symbol of symbols) {
    const category = classifyDirectSymbol(symbol)
    if (category === 'tencent') tencentSymbols.push(symbol)
    else if (category === 'crypto') cryptoSymbols.push(symbol)
    else if (category === 'fx') fxSymbols.push(symbol)
  }
  const [tencent, crypto, fx] = await Promise.all([
    loadTencentQuotes(tencentSymbols, timeoutMs, trackPending),
    fetchBinanceQuotes(cryptoSymbols, timeoutMs),
    fetchFrankfurterQuotes(fxSymbols, timeoutMs),
  ])
  const quotes = []
  for (const [symbol, row] of tencent) {
    quotes.push({
      symbol,
      name: row.name !== '' ? row.name : symbol,
      price: row.price,
      changeAbs: row.change,
      changePct: row.changePct,
      source: 'tencent',
    })
  }
  for (const quote of crypto.values()) quotes.push(quote)
  for (const quote of fx.values()) quotes.push(quote)
  return quotes
}

/* ── session.ts (v1 market-session logic, verbatim) ────────────────────── */

/** Weekday in the target timezone ('Mon'..'Sun'). */
function tzWeekday(timeZone, date) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date)
}

/** Minutes since midnight in the target timezone. */
function tzMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/** Is now a weekday in timeZone? */
function isWeekday(timeZone, now) {
  const day = tzWeekday(timeZone, now)
  return day !== 'Sat' && day !== 'Sun'
}

/** Phase for one continuous-session market. */
function continuousPhase(minutes, open, close, preOpen) {
  if (minutes >= open && minutes < close) return 'trading'
  if (preOpen !== undefined && minutes >= preOpen && minutes < open) return 'pre'
  return 'closed'
}

/** Phase for a split-session market (A-share, HK). */
function splitPhase(minutes, open, lunch, resume, close) {
  if (minutes >= open && minutes < lunch) return 'trading'
  if (minutes >= lunch && minutes < resume) return 'lunch'
  if (minutes >= resume && minutes < close) return 'trading'
  return 'closed'
}

/** Session phases for the three markets at now. */
function marketSessions(now = new Date()) {
  const aShareOpen = isWeekday('Asia/Shanghai', now)
  const hkOpen = isWeekday('Asia/Hong_Kong', now)
  const usOpen = isWeekday('America/New_York', now)
  return {
    aShare: aShareOpen
      ? splitPhase(tzMinutes('Asia/Shanghai', now), 9 * 60 + 30, 11 * 60 + 30, 13 * 60, 15 * 60)
      : 'closed',
    hk: hkOpen
      ? splitPhase(tzMinutes('Asia/Hong_Kong', now), 9 * 60 + 30, 12 * 60, 13 * 60, 16 * 60)
      : 'closed',
    us: usOpen
      ? continuousPhase(tzMinutes('America/New_York', now), 9 * 60 + 30, 16 * 60, 4 * 60)
      : 'closed',
  }
}

/** Chinese label for one phase. */
function phaseLabel(phase) {
  switch (phase) {
    case 'trading': return '盘中'
    case 'lunch': return '午休'
    case 'pre': return '盘前'
    case 'closed': return '休市'
    default: return '休市'
  }
}

/* ── refresh-scheduler.ts (v1 single-timer scheduler, verbatim) ────────── */

/**
 * Create a scheduler that drives all jobs from one tickMs interval, gating
 * each job by its own periodMs. On start every job's clock begins at the
 * start time, so the first tick runs jobs due since start; stop clears the
 * interval so no work leaks.
 */
function createRefreshScheduler(jobs, tickMs) {
  const lastRun = new Map()
  let timer = null

  const tick = () => {
    const now = Date.now()
    for (const job of jobs) {
      const last = lastRun.get(job) ?? now
      if (now - last >= job.periodMs) {
        lastRun.set(job, now)
        job.run()
      }
    }
  }

  return {
    start: () => {
      if (timer !== null) return
      const now = Date.now()
      for (const job of jobs) lastRun.set(job, now)
      timer = setInterval(tick, tickMs)
    },
    stop: () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

/* ── apply ─────────────────────────────────────────────────────────────── */

/** Candlestick brand mark, inline so the skin carries no static assets. */
const CANDLE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48">',
  '<rect x="6" y="14" width="8" height="20" fill="#fff"/>',
  '<rect x="9" y="6" width="2" height="36" fill="#fff"/>',
  '<rect x="17" y="20" width="8" height="18" fill="#fff"/>',
  '<rect x="20" y="12" width="2" height="34" fill="#fff"/>',
  '<rect x="28" y="10" width="8" height="16" fill="#fff"/>',
  '<rect x="31" y="4" width="2" height="28" fill="#fff"/>',
  '</svg>',
].join('')

/** Brand-red rounded-square favicon carrying the candle mark, inline data URI. */
const FAVICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
  '<rect x="2" y="2" width="60" height="60" rx="14" fill="#f23645"/>',
  '<rect x="14" y="24" width="8" height="16" rx="1" fill="#fff"/>',
  '<rect x="17" y="18" width="2" height="28" rx="1" fill="#fff"/>',
  '<rect x="28" y="30" width="8" height="14" rx="1" fill="#fff"/>',
  '<rect x="31" y="24" width="2" height="26" rx="1" fill="#fff"/>',
  '<rect x="42" y="22" width="8" height="12" rx="1" fill="#fff"/>',
  '<rect x="45" y="16" width="2" height="24" rx="1" fill="#fff"/>',
  '</svg>',
].join('')

/** Placeholder quote for the pre-data chrome. */
function placeholderQuote(symbol) {
  return { symbol, name: symbol, price: Number.NaN, changePct: Number.NaN, changeAbs: Number.NaN, source: 'tencent' }
}

/** 0.42 -> +0.42%; -0.50 -> 0.50% (the glyph already carries direction);
 *  flat renders a dash. */
function pctText(trend, pct) {
  if (trend === 'flat') return '—'
  const abs = Math.abs(pct)
  return `${trend === 'up' ? '+' : ''}${abs.toFixed(2)}%`
}

/** 3926.96 -> 3,926.96; NaN renders the dash. */
function priceText(price) {
  return Number.isFinite(price) ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'
}

/** Apply the trend to a cell element (data-trend drives the 红涨绿跌 colors). */
function applyTrend(el, trend) {
  if (trend === 'flat') delete el.dataset.trend
  else el.dataset.trend = trend
}

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const body = document.body
      const originalTitle = document.title
      let disposed = false
      /** Cancel callbacks for in-flight Tencent script-tag loads. */
      const pendingLoads = new Set()
      const trackPending = (cancel) => {
        pendingLoads.add(cancel)
        return () => pendingLoads.delete(cancel)
      }

      // ── chrome skeleton ────────────────────────────────────────────────

      const titlebar = document.createElement('div')
      titlebar.className = CLS.tradingTitlebar
      titlebar.dataset.skinChrome = 'titlebar'
      const brand = document.createElement('span')
      brand.className = CLS.tradingTitlebarIcon
      brand.innerHTML = CANDLE_SVG
      const title = document.createElement('span')
      title.className = CLS.tradingTitlebarTitle
      title.textContent = SKIN_TITLE
      const chips = document.createElement('span')
      chips.className = CLS.tradingTitlebarChips
      titlebar.append(brand, title, chips)
      for (const glyph of TITLEBAR_GLYPHS) {
        const btn = document.createElement('span')
        btn.className = CLS.tradingTitlebarBtn
        btn.setAttribute('aria-hidden', 'true')
        btn.textContent = glyph
        titlebar.append(btn)
      }

      const tape = document.createElement('div')
      tape.className = CLS.tradingTape
      tape.dataset.skinChrome = 'tape'
      const track = document.createElement('div')
      track.className = CLS.tradingTapeTrack
      tape.append(track)

      const statusbar = document.createElement('div')
      statusbar.className = CLS.tradingStatusbar
      statusbar.dataset.skinChrome = 'statusbar'
      const leftGroup = document.createElement('span')
      leftGroup.className = CLS.tradingStatusbarGroup
      const sessionCells = new Map()
      const sessionLabels = [
        ['aShare', 'A股'], ['hk', '港股'], ['us', '美股'],
      ]
      for (const [key, label] of sessionLabels) {
        const cell = document.createElement('span')
        cell.className = CLS.tradingStatusbarCell
        cell.textContent = `${label} 休市`
        sessionCells.set(key, cell)
        leftGroup.append(cell)
      }
      const spacer = document.createElement('span')
      spacer.className = CLS.tradingStatusbarSpacer
      const lbGroup = document.createElement('span')
      lbGroup.className = CLS.tradingStatusbarGroup
      const lbLabel = document.createElement('span')
      lbLabel.className = CLS.tradingStatusbarLbLabel
      lbLabel.textContent = '长桥'
      const lbCells = []
      for (let i = 0; i < DEFAULT_INDEX_CELLS.length; i += 1) {
        const cell = document.createElement('span')
        cell.className = CLS.tradingStatusbarCell
        cell.textContent = '-- --'
        lbCells.push(cell)
        lbGroup.append(cell)
      }
      lbGroup.prepend(lbLabel)
      const codeIndexCell = document.createElement('span')
      codeIndexCell.className = CLS.tradingStatusbarCell
      codeIndexCell.textContent = '工作区 --'
      const rightGroup = document.createElement('span')
      rightGroup.className = CLS.tradingStatusbarGroup
      for (const state of ['就绪', '已连接', '在线']) {
        const cell = document.createElement('span')
        cell.className = CLS.tradingStatusbarCell
        cell.textContent = state
        rightGroup.append(cell)
      }
      statusbar.append(leftGroup, spacer, lbGroup, codeIndexCell, rightGroup)

      const favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.href = `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`

      document.title = SKIN_TITLE
      document.head.append(favicon)
      body.append(titlebar, tape, statusbar)

      // ── rendering ──────────────────────────────────────────────────────

      /** Render one quote cell (tape item or titlebar chip). */
      function renderQuoteCell(container, quote, nameClass, valueClass, chgClass) {
        container.textContent = ''
        const trend = trendOf(quote)
        const name = document.createElement('span')
        name.className = nameClass
        name.textContent = quote.name
        const price = document.createElement('span')
        price.className = valueClass
        price.textContent = priceText(quote.price)
        const chg = document.createElement('span')
        chg.className = chgClass
        chg.textContent = `${trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''}${pctText(trend, quote.changePct)}`
        applyTrend(chg, trend)
        container.append(name, price, chg)
      }

      /** Rebuild the tape track: two identical copies for the seamless loop. */
      function renderTape(quotes) {
        const items = quotes.length > 0 ? quotes : DEFAULT_TAPE.map(placeholderQuote)
        track.textContent = ''
        for (let copy = 0; copy < 2; copy += 1) {
          for (const quote of items) {
            const item = document.createElement('span')
            item.className = CLS.tradingTapeItem
            renderQuoteCell(
              item, quote,
              CLS.tradingTapeName, CLS.tradingTapePrice, CLS.tradingTapeChg,
            )
            track.append(item)
          }
        }
        // Loop speed scales with content length so the tape never crawls.
        track.style.animationDuration = `${Math.max(30, items.length * 4)}s`
      }

      /** Titlebar chips: the first quotes of the tape, compact. */
      function renderChips(quotes) {
        chips.textContent = ''
        const shown = quotes.length > 0 ? quotes.slice(0, 3) : DEFAULT_TAPE.slice(0, 3).map(placeholderQuote)
        for (const quote of shown) {
          const chip = document.createElement('span')
          chip.className = CLS.tradingTitlebarChip
          renderQuoteCell(chip, quote, CLS.tradingTitlebarChipName, CLS.tradingTitlebarChipVal, CLS.tradingTitlebarChipChg)
          chips.append(chip)
        }
      }

      /** Status-bar HK/US index cells: the public fallback feed (the v2
       *  hooks context has no connection facet for the longbridge RPC
       *  tier, so the cells always take v1's no-plugin path). */
      function renderIndexCells(quotes) {
        for (let i = 0; i < lbCells.length; i += 1) {
          const cell = lbCells[i]
          const quote = quotes[i]
          if (quote === undefined) {
            cell.textContent = '-- --'
            delete cell.dataset.trend
            continue
          }
          cell.textContent = `${quote.name} ${priceText(quote.price)}`
          const trend = trendOf(quote)
          const chg = document.createElement('span')
          chg.textContent = `${trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''}${pctText(trend, quote.changePct)}`
          cell.append(' ', chg)
          applyTrend(cell, trend)
        }
      }

      /** Session cells: A股 / 港股 / 美股 phases. */
      function renderSessions(now) {
        const phases = marketSessions(now)
        for (const [key, cell] of sessionCells) {
          const phase = phases[key]
          cell.textContent = `${sessionLabels.find(([k]) => k === key)?.[1] ?? key} ${phaseLabel(phase)}`
          cell.dataset.phase = phase
        }
      }

      // ── data pollers ───────────────────────────────────────────────────

      /** One quote cycle: fun-ticker watchlist first, standalone feeds second. */
      const refreshQuotes = async () => {
        if (disposed) return
        let quotes = []
        const tickerSymbols = await fetchTickerSettings()
        if (tickerSymbols !== null) {
          const tickerQuotes = await fetchTickerQuotes(tickerSymbols)
          if (tickerQuotes !== null) quotes = tickerQuotes
        }
        if (quotes.length === 0) quotes = await fetchDirectQuotes(DEFAULT_TAPE, 8000, trackPending)
        if (disposed) return
        renderTape(quotes)
        renderChips(quotes)
      }

      /** One index cycle: v1 preferred the longbridge RPC snapshot; the v2
       *  hooks context has no connection transport, so this is the v1
       *  fallback path (public Tencent feed) directly. */
      const refreshIndices = async () => {
        if (disposed) return
        lbLabel.textContent = '指数'
        const fallback = await fetchDirectQuotes(DEFAULT_INDEX_CELLS, 8000, trackPending)
        if (disposed) return
        renderIndexCells(fallback)
      }

      // First paint: placeholders + session cells, then live cycles.
      renderTape([])
      renderChips([])
      renderIndexCells([])
      renderSessions(new Date())
      void refreshQuotes()
      void refreshIndices()

      // One interval drives both refresh paths; each job runs only when
      // its own cadence has elapsed, so the single timer preserves the
      // original per-panel periods (quotes 30s, sessions 60s) with one
      // timer to own and dispose. The v1 workspace-count job needed the
      // connection facet and is dropped with it (the cell keeps its dash).
      const scheduler = createRefreshScheduler([
        { periodMs: QUOTES_REFRESH_MS, run: () => { void refreshQuotes(); void refreshIndices() } },
        { periodMs: SESSION_REFRESH_MS, run: () => renderSessions(new Date()) },
      ], QUOTES_REFRESH_MS)
      scheduler.start()

      ctx.onCleanup(() => {
        disposed = true
        scheduler.stop()
        for (const cancel of pendingLoads) cancel()
        pendingLoads.clear()
        titlebar.remove()
        tape.remove()
        statusbar.remove()
        favicon.remove()
        // Only restore when the skin's own title still stands — a session title
        // projected by the shell must not be clobbered by skin teardown.
        if (document.title === SKIN_TITLE) document.title = originalTitle
      })
    },
  }
}
