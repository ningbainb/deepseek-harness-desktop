import {
  adminConfigured,
  clearedSessionCookie,
  createSession,
  hasValidSession,
  parseLoginPassword,
  passwordMatches,
  sessionCookie,
} from './admin-auth.mjs'

const DAY_RANGES = new Set([7, 30, 90, 365])
const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const DOWNLOAD_TOTAL_SQL = [
  'SELECT COALESCE(SUM(count), 0) AS total',
  'FROM download_click_daily',
  "WHERE day >= date('now', ?)",
].join(' ')

const DOWNLOAD_TREND_SQL = [
  'SELECT day, SUM(count) AS count',
  'FROM download_click_daily',
  "WHERE day >= date('now', ?)",
  'GROUP BY day ORDER BY day',
].join(' ')

const DOWNLOAD_COUNTRIES_SQL = [
  'SELECT country_code AS countryCode, SUM(count) AS count',
  'FROM download_click_daily',
  "WHERE day >= date('now', ?)",
  'GROUP BY country_code ORDER BY count DESC, country_code LIMIT 250',
].join(' ')

const DOWNLOAD_SOURCES_SQL = [
  'SELECT source, SUM(count) AS count',
  'FROM download_click_daily',
  "WHERE day >= date('now', ?)",
  'GROUP BY source ORDER BY count DESC, source',
].join(' ')

const DOWNLOAD_VERSIONS_SQL = [
  'SELECT release_version AS version, SUM(count) AS count',
  'FROM download_click_daily',
  "WHERE day >= date('now', ?)",
  'GROUP BY release_version ORDER BY count DESC, release_version LIMIT 30',
].join(' ')

const DESKTOP_LAUNCHES_SQL = [
  'SELECT COALESCE(SUM(count), 0) AS total',
  'FROM metric_daily',
  "WHERE day >= date('now', ?) AND event = 'app_launch'",
].join(' ')

const DESKTOP_SURFACES_SQL = [
  'SELECT detail AS surface, SUM(count) AS count',
  'FROM metric_daily',
  "WHERE day >= date('now', ?) AND event = 'surface_opened'",
  'GROUP BY detail ORDER BY count DESC, detail',
].join(' ')

const DESKTOP_EVENTS_SQL = [
  'SELECT event, SUM(count) AS count',
  'FROM metric_daily',
  "WHERE day >= date('now', ?)",
  'GROUP BY event ORDER BY count DESC, event',
].join(' ')

const ACTIVE_DAILY_TREND_SQL = [
  'SELECT day, COUNT(DISTINCT daily_actor) AS count',
  'FROM product_actor_daily',
  "WHERE day >= date('now', ?) AND event = 'app_launch'",
  'GROUP BY day ORDER BY day',
].join(' ')

const ACTIVE_MONTHLY_TREND_SQL = [
  'SELECT month, COUNT(DISTINCT monthly_actor) AS count',
  'FROM product_actor_monthly',
  "WHERE month >= substr(date('now', ?), 1, 7) AND event = 'app_launch'",
  'GROUP BY month ORDER BY month',
].join(' ')

const ACTIVE_COUNTRIES_SQL = [
  'SELECT country_code AS countryCode, COUNT(DISTINCT monthly_actor) AS count',
  'FROM product_actor_monthly',
  "WHERE month >= substr(date('now', ?), 1, 7) AND event = 'app_launch'",
  'GROUP BY country_code ORDER BY count DESC, country_code LIMIT 250',
].join(' ')

const ACTIVE_VERSIONS_SQL = [
  'SELECT app_version AS version, COUNT(DISTINCT monthly_actor) AS count',
  'FROM product_actor_monthly',
  "WHERE month >= substr(date('now', ?), 1, 7) AND event = 'app_launch'",
  'GROUP BY app_version ORDER BY count DESC, app_version LIMIT 30',
].join(' ')

const UPDATE_FUNNEL_SQL = [
  'SELECT event, COUNT(DISTINCT monthly_actor) AS count',
  'FROM product_actor_monthly',
  "WHERE month >= substr(date('now', ?), 1, 7)",
  "AND event IN ('update_available', 'update_downloaded', 'update_install_requested', 'update_completed', 'update_error')",
  'GROUP BY event ORDER BY count DESC, event',
].join(' ')

const DOCK_FUNNEL_SQL = [
  'SELECT event, COUNT(DISTINCT monthly_actor) AS count',
  'FROM product_actor_monthly',
  "WHERE month >= substr(date('now', ?), 1, 7)",
  "AND event IN ('dock_entry_impression', 'dock_nudge_shown', 'dock_entry_click', 'dock_opened', 'extension_operation')",
  'GROUP BY event ORDER BY count DESC, event',
].join(' ')

const RETENTION_COHORTS_SQL = [
  'SELECT cohort.first_seen_day AS cohortDay, COUNT(*) AS cohortUsers,',
  "CASE WHEN date(cohort.first_seen_day, '+1 day') < date('now') THEN COUNT(day1.installation_actor) END AS retainedD1,",
  "CASE WHEN date(cohort.first_seen_day, '+7 days') < date('now') THEN COUNT(day7.installation_actor) END AS retainedD7,",
  "CASE WHEN date(cohort.first_seen_day, '+30 days') < date('now') THEN COUNT(day30.installation_actor) END AS retainedD30",
  'FROM product_installation_first_seen cohort',
  "LEFT JOIN product_installation_daily day1 ON day1.installation_actor = cohort.installation_actor AND day1.day = date(cohort.first_seen_day, '+1 day')",
  "LEFT JOIN product_installation_daily day7 ON day7.installation_actor = cohort.installation_actor AND day7.day = date(cohort.first_seen_day, '+7 days')",
  "LEFT JOIN product_installation_daily day30 ON day30.installation_actor = cohort.installation_actor AND day30.day = date(cohort.first_seen_day, '+30 days')",
  "WHERE cohort.first_seen_day >= date('now', ?)",
  'GROUP BY cohort.first_seen_day ORDER BY cohort.first_seen_day DESC',
].join(' ')

const SESSION_DURATION_SQL = [
  'SELECT bucket, SUM(count) AS count',
  'FROM metric_daily',
  "WHERE day >= date('now', ?) AND event = 'app_session_end'",
  'GROUP BY bucket ORDER BY count DESC, bucket',
].join(' ')

function currentDate(seams) {
  return typeof seams.now === 'function' ? seams.now() : new Date()
}

function adminHeaders(contentType, extra = {}) {
  return {
    'cache-control': 'no-store',
    'content-security-policy': ADMIN_CSP,
    'content-type': contentType,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...extra,
  }
}

function adminResponse(status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  return new Response(body, {
    status,
    headers: adminHeaders(contentType, headers),
  })
}

function redirect(location, cookie) {
  const headers = { location }
  if (cookie) headers['set-cookie'] = cookie
  return adminResponse(303, null, 'text/plain; charset=utf-8', headers)
}

const LOGIN_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23141817'/%3E%3Cpath d='M16 16h15c12 0 19 6 19 16S43 48 31 48H16zm10 8v16h5c6 0 9-3 9-8s-3-8-9-8z' fill='%23b9f227'/%3E%3C/svg%3E">
  <title>DSH 产品数据看板</title>
  <style>
    :root {
      --ink: #151817;
      --paper: #f1eee4;
      --paper-deep: #e3dfd2;
      --signal: #b9f227;
      --alert: #dd4b35;
      --line: rgba(21, 24, 23, .18);
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--paper); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      font-family: "Microsoft YaHei UI", "Noto Sans SC", sans-serif;
      background:
        linear-gradient(120deg, transparent 0 62%, rgba(185, 242, 39, .16) 62% 78%, transparent 78%),
        repeating-linear-gradient(0deg, transparent 0 39px, rgba(21, 24, 23, .045) 40px),
        var(--paper);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .23;
      background-image: radial-gradient(rgba(21, 24, 23, .3) .6px, transparent .6px);
      background-size: 5px 5px;
    }
    main {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 18px;
    }
    .login {
      position: relative;
      width: min(100%, 460px);
      border: 1px solid var(--ink);
      background: rgba(241, 238, 228, .94);
      box-shadow: 12px 12px 0 var(--ink);
    }
    .rail {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      color: var(--paper);
      background: var(--ink);
      font: 700 12px/1 "Bahnschrift", "DIN Alternate", sans-serif;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .status { display: inline-flex; gap: 8px; align-items: center; }
    .status::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--signal);
      box-shadow: 0 0 0 3px rgba(185, 242, 39, .18);
    }
    .content { padding: 38px 34px 32px; }
    .kicker {
      margin: 0 0 16px;
      font: 700 12px/1 "Bahnschrift", "DIN Alternate", sans-serif;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font: 800 clamp(34px, 9vw, 50px)/.98 "Bahnschrift Condensed", "Microsoft YaHei UI", sans-serif;
      letter-spacing: -.035em;
    }
    .lead {
      margin: 20px 0 28px;
      color: rgba(21, 24, 23, .68);
      font-size: 14px;
      line-height: 1.75;
    }
    label {
      display: block;
      margin-bottom: 9px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .06em;
    }
    input {
      width: 100%;
      min-height: 50px;
      padding: 0 14px;
      border: 1px solid var(--ink);
      border-radius: 0;
      outline: none;
      color: var(--ink);
      background: #fffdf7;
      font: 600 16px/1 "Bahnschrift", monospace;
    }
    input:focus { box-shadow: 0 0 0 3px var(--signal); }
    button {
      width: 100%;
      min-height: 50px;
      margin-top: 12px;
      border: 1px solid var(--ink);
      color: var(--ink);
      background: var(--signal);
      cursor: pointer;
      font: 800 14px/1 "Bahnschrift", "Microsoft YaHei UI", sans-serif;
      letter-spacing: .08em;
    }
    button:hover { filter: brightness(.94); }
    .error {
      margin: 0 0 14px;
      padding: 10px 12px;
      border-left: 4px solid var(--alert);
      background: rgba(221, 75, 53, .1);
      font-size: 13px;
    }
    .privacy {
      margin: 24px 0 0;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      color: rgba(21, 24, 23, .62);
      font-size: 12px;
      line-height: 1.65;
    }
    @media (max-width: 520px) {
      .content { padding: 30px 22px 26px; }
      .login { box-shadow: 7px 7px 0 var(--ink); }
    }
  </style>
</head>
<body>
  <main>
    <section class="login" aria-labelledby="login-title">
      <div class="rail"><span>DSH / SIGNAL ROOM</span><span class="status">PRIVATE</span></div>
      <div class="content">
        <p class="kicker">Aggregate telemetry console</p>
        <h1 id="login-title">产品数据看板</h1>
        <p class="lead">查看官网下载按钮点击和桌面产品功能的匿名日聚合数据。这里没有用户列表，也不保存 IP、设备标识或原始事件。</p>
        <!--ERROR-->
        <form method="post" action="/admin/login">
          <label for="password">管理密码</label>
          <input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required autofocus>
          <button type="submit">进入看板</button>
        </form>
        <p class="privacy">登录状态保留 8 小时，仅存放在 Secure、HttpOnly Cookie 中。关闭统计不会影响软件和下载链接。</p>
      </div>
    </section>
  </main>
</body>
</html>`

const DASHBOARD_PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23141817'/%3E%3Cpath d='M16 16h15c12 0 19 6 19 16S43 48 31 48H16zm10 8v16h5c6 0 9-3 9-8s-3-8-9-8z' fill='%23b9f227'/%3E%3C/svg%3E">
  <title>DSH 产品数据看板</title>
  <style>
    :root {
      --ink: #141817;
      --paper: #f2efe6;
      --panel: #fbf9f2;
      --muted: #6d716c;
      --line: rgba(20, 24, 23, .17);
      --signal: #b9f227;
      --signal-deep: #749b00;
      --orange: #ff754a;
      --blue: #2d65f2;
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--paper); }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      font-family: "Microsoft YaHei UI", "Noto Sans SC", sans-serif;
      background:
        linear-gradient(115deg, transparent 0 72%, rgba(185, 242, 39, .12) 72% 88%, transparent 88%),
        repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), rgba(20, 24, 23, .035) 25%),
        var(--paper);
    }
    button { font: inherit; }
    .topline {
      position: sticky;
      z-index: 10;
      top: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 42px;
      padding: 0 max(22px, calc((100vw - 1360px) / 2));
      color: var(--paper);
      background: var(--ink);
      font: 700 11px/1 "Bahnschrift", "DIN Alternate", sans-serif;
      letter-spacing: .13em;
      text-transform: uppercase;
    }
    .live { display: inline-flex; align-items: center; gap: 9px; }
    .live::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--signal);
      box-shadow: 0 0 0 3px rgba(185, 242, 39, .18);
    }
    .shell {
      width: min(1360px, calc(100% - 44px));
      margin: 0 auto;
      padding: 38px 0 70px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 28px;
      align-items: end;
      margin-bottom: 30px;
    }
    .eyebrow {
      margin: 0 0 11px;
      font: 700 11px/1 "Bahnschrift", "DIN Alternate", sans-serif;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font: 800 clamp(40px, 6vw, 78px)/.88 "Bahnschrift Condensed", "Microsoft YaHei UI", sans-serif;
      letter-spacing: -.045em;
    }
    .header-actions { display: flex; align-items: center; gap: 14px; }
    .range {
      display: flex;
      padding: 3px;
      border: 1px solid var(--ink);
      background: var(--panel);
    }
    .range button {
      min-width: 50px;
      padding: 9px 10px;
      border: 0;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
      font: 700 12px/1 "Bahnschrift", sans-serif;
    }
    .range button[aria-pressed="true"] { color: var(--ink); background: var(--signal); }
    .logout {
      padding: 10px 14px;
      border: 1px solid var(--ink);
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
    }
    .notice {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: start;
      margin-bottom: 18px;
      padding: 14px 16px;
      border: 1px solid var(--ink);
      background: var(--signal);
      font-size: 13px;
      line-height: 1.65;
    }
    .notice b {
      font: 800 11px/1.4 "Bahnschrift", sans-serif;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-top: 1px solid var(--ink);
      border-left: 1px solid var(--ink);
      margin-bottom: 18px;
    }
    .retention-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .metric {
      min-height: 154px;
      padding: 22px;
      border-right: 1px solid var(--ink);
      border-bottom: 1px solid var(--ink);
      background: rgba(251, 249, 242, .86);
    }
    .metric:nth-child(2) { background: var(--ink); color: var(--paper); }
    .metric small {
      display: block;
      min-height: 32px;
      color: inherit;
      opacity: .64;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
      letter-spacing: .09em;
      text-transform: uppercase;
    }
    .metric strong {
      display: block;
      margin-top: 15px;
      font: 800 clamp(34px, 5vw, 58px)/.9 "Bahnschrift Condensed", sans-serif;
      letter-spacing: -.035em;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(300px, .8fr);
      gap: 18px;
      margin-bottom: 18px;
    }
    .grid.equal { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .panel {
      min-width: 0;
      border: 1px solid var(--ink);
      background: rgba(251, 249, 242, .9);
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: baseline;
      min-height: 53px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--ink);
    }
    .panel-head h2 {
      margin: 0;
      font: 800 17px/1 "Bahnschrift", "Microsoft YaHei UI", sans-serif;
      letter-spacing: -.01em;
    }
    .panel-head span { color: var(--muted); font-size: 11px; }
    .panel-body { padding: 18px; }
    .chart-wrap { min-height: 260px; }
    #trend-chart { display: block; width: 100%; min-height: 238px; overflow: visible; }
    .axis-line { stroke: rgba(20, 24, 23, .16); stroke-width: 1; }
    .trend-area { fill: rgba(185, 242, 39, .28); }
    .trend-line { fill: none; stroke: var(--ink); stroke-width: 3; vector-effect: non-scaling-stroke; }
    .trend-point { fill: var(--signal); stroke: var(--ink); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .chart-label { fill: var(--muted); font: 12px "Bahnschrift", sans-serif; }
    .bars { display: grid; gap: 15px; }
    .bar-row { display: grid; gap: 7px; }
    .bar-meta { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
    .bar-meta b { font-weight: 800; }
    .bar-track { height: 9px; background: #dfdcd2; overflow: hidden; }
    .bar-fill {
      display: block;
      height: 100%;
      width: 0;
      background: var(--ink);
      transform-origin: left;
      animation: reveal .55s cubic-bezier(.2,.8,.2,1) both;
    }
    .bars.accent .bar-fill { background: var(--blue); }
    .table-wrap { overflow: auto; max-height: 430px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 13px 18px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; color: var(--muted); background: var(--panel); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
    td:last-child, th:last-child { text-align: right; }
    .country-code {
      display: inline-block;
      min-width: 31px;
      margin-right: 9px;
      padding: 3px 4px;
      color: var(--paper);
      background: var(--ink);
      font: 700 10px/1 "Bahnschrift", sans-serif;
      text-align: center;
    }
    .empty {
      display: grid;
      place-items: center;
      min-height: 150px;
      color: var(--muted);
      border: 1px dashed var(--line);
      font-size: 13px;
      text-align: center;
    }
    .foot {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-top: 22px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.6;
    }
    .load-state {
      min-height: 18px;
      color: var(--muted);
      font: 700 10px/1 "Bahnschrift", sans-serif;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .load-state[data-state="error"] { color: #b52d20; }
    @keyframes reveal { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { .bar-fill { animation: none; } }
    @media (max-width: 920px) {
      header { grid-template-columns: 1fr; align-items: start; }
      .header-actions { justify-content: space-between; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid, .grid.equal { grid-template-columns: 1fr; }
    }
    @media (max-width: 580px) {
      .topline { padding: 0 14px; }
      .topline-wide { display: none; }
      .shell { width: min(100% - 24px, 1360px); padding-top: 26px; }
      .metrics { grid-template-columns: 1fr; }
      .metric { min-height: 122px; }
      .header-actions { align-items: stretch; flex-direction: column; }
      .range { justify-content: stretch; }
      .range button { flex: 1; min-width: 0; }
      .logout { width: 100%; }
      .notice { grid-template-columns: 1fr; }
      .foot { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="topline"><span><span class="topline-wide">DSH / SIGNAL ROOM / </span>AGGREGATE ONLY</span><span class="live">SERVICE ONLINE</span></div>
  <main class="shell">
    <header>
      <div>
        <p class="eyebrow">Anonymous product telemetry</p>
        <h1>产品数据看板</h1>
      </div>
      <div class="header-actions">
        <div class="range" aria-label="统计周期">
          <button type="button" data-days="7" aria-pressed="false">7D</button>
          <button type="button" data-days="30" aria-pressed="true">30D</button>
          <button type="button" data-days="90" aria-pressed="false">90D</button>
          <button type="button" data-days="365" aria-pressed="false">1Y</button>
        </div>
        <form method="post" action="/admin/logout"><button class="logout" type="submit">退出登录</button></form>
      </div>
    </header>

    <section class="notice">
      <b>统计口径</b>
      <span>DAU、MAU、国家和漏斗人数使用周期匿名标识去重；D1、D7、D30 使用独立的稳定匿名安装哈希计算。系统不保存 IP、账号、机器码、硬件信息或原始事件。</span>
    </section>

    <section class="metrics" aria-label="核心指标">
      <article class="metric"><small>下载按钮点击</small><strong id="metric-downloads">--</strong></article>
      <article class="metric"><small>日活用户</small><strong id="metric-dau">--</strong></article>
      <article class="metric"><small>月活用户</small><strong id="metric-mau">--</strong></article>
      <article class="metric"><small>活跃国家或地区</small><strong id="metric-countries">--</strong></article>
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-head"><h2>下载点击趋势</h2><span>UTC 日聚合</span></div>
        <div class="panel-body chart-wrap"><svg id="trend-chart" viewBox="0 0 760 238" role="img" aria-label="下载按钮点击趋势"></svg></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>下载入口</h2><span>固定官网位置</span></div>
        <div class="panel-body"><div id="source-bars" class="bars accent"></div></div>
      </article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>国家与地区用户</h2><span>月匿名用户去重</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>地区</th><th>用户数</th></tr></thead>
            <tbody id="country-rows"></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>版本采用</h2><span>月匿名用户去重</span></div>
        <div class="panel-body"><div id="version-bars" class="bars"></div></div>
      </article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>桌面界面打开</h2><span>界面打开事件次数</span></div>
        <div class="panel-body"><div id="surface-bars" class="bars accent"></div></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>桌面事件概览</h2><span>匿名聚合事件</span></div>
        <div class="panel-body"><div id="event-bars" class="bars"></div></div>
      </article>
    </section>

    <section class="metrics retention-metrics" aria-label="留存率">
      <article class="metric"><small>D1 留存率</small><strong id="metric-retention-d1">--</strong></article>
      <article class="metric"><small>D7 留存率</small><strong id="metric-retention-d7">--</strong></article>
      <article class="metric"><small>D30 留存率</small><strong id="metric-retention-d30">--</strong></article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>应用内更新漏斗</h2><span>月匿名用户去重</span></div>
        <div class="panel-body"><div id="update-funnel-bars" class="bars accent"></div></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>拓展坞漏斗</h2><span>曝光、点击、打开、操作</span></div>
        <div class="panel-body"><div id="dock-funnel-bars" class="bars"></div></div>
      </article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>新用户留存 cohort</h2><span>UTC 首次启动日期</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>新用户</th><th>D1</th><th>D7</th><th>D30</th></tr></thead>
            <tbody id="retention-rows"></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>用户使用时长</h2><span>退出时的会话时长区间</span></div>
        <div class="panel-body"><div id="duration-bars" class="bars accent"></div></div>
      </article>
    </section>

    <footer class="foot">
      <span>日匿名行保留 35 天，月匿名行保留 13 个月，留存 cohort 与趋势聚合保留 400 天。看板请求不会写入产品统计表。</span>
      <span><span id="load-state" class="load-state" data-state="loading">LOADING DATA</span><br><span id="generated-at"></span></span>
    </footer>
  </main>
  <script src="/admin/dashboard.js" defer></script>
</body>
</html>`

const DASHBOARD_SCRIPT = String.raw`'use strict'

const numberFormat = new Intl.NumberFormat('zh-CN')
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
})
const sourceLabels = Object.freeze({
  nav: '顶部导航',
  hero: '首屏主按钮',
  terminal: '终端演示区',
  install: '安装说明区',
})
const surfaceLabels = Object.freeze({
  settings: '设置',
  extensions: '扩展',
  community: '社区',
  updates: '更新',
  help: '帮助',
})
const eventLabels = Object.freeze({
  app_launch: '应用启动',
  runtime_start_result: '运行时启动结果',
  runtime_recovery_action: '运行时恢复操作',
  surface_opened: '界面打开',
  update_result: '更新结果',
  update_available: '发现更新',
  update_downloaded: '更新已下载',
  update_install_requested: '请求安装',
  update_completed: '更新完成',
  update_error: '更新失败',
  dock_entry_impression: '拓展坞入口曝光',
  dock_nudge_shown: '拓展坞提示曝光',
  dock_nudge_dismissed: '拓展坞提示关闭',
  dock_entry_click: '拓展坞入口点击',
  dock_opened: '拓展坞打开',
  extension_operation: '扩展操作',
  app_session_end: '会话结束',
})
const durationLabels = Object.freeze({
  'under-5m': '5 分钟以内',
  '5-30m': '5 至 30 分钟',
  '30-120m': '30 至 120 分钟',
  'over-120m': '120 分钟以上',
})
let regionNames = null
try {
  regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
} catch {
  regionNames = null
}

function element(id) {
  return document.getElementById(id)
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function setText(id, value) {
  element(id).textContent = value
}

function formatCount(value) {
  return numberFormat.format(Number.isFinite(Number(value)) ? Number(value) : 0)
}

function formatPercent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '--'
    : Number(value).toFixed(2).replace(/\.00$/u, '') + '%'
}

function emptyMessage(text) {
  const node = document.createElement('div')
  node.className = 'empty'
  node.textContent = text
  return node
}

function renderBars(id, rows, labelFor) {
  const root = element(id)
  clear(root)
  if (!rows.length) {
    root.appendChild(emptyMessage('当前周期暂无数据'))
    return
  }
  const maximum = Math.max(1, ...rows.map((row) => Number(row.count) || 0))
  for (const row of rows) {
    const item = document.createElement('div')
    item.className = 'bar-row'
    const meta = document.createElement('div')
    meta.className = 'bar-meta'
    const label = document.createElement('span')
    label.textContent = labelFor(row)
    const value = document.createElement('b')
    value.textContent = formatCount(row.count)
    meta.append(label, value)
    const track = document.createElement('div')
    track.className = 'bar-track'
    const fill = document.createElement('span')
    fill.className = 'bar-fill'
    fill.style.width = Math.max(2, (Number(row.count) || 0) / maximum * 100).toFixed(2) + '%'
    track.appendChild(fill)
    item.append(meta, track)
    root.appendChild(item)
  }
}

function svgNode(name, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value))
  return node
}

function renderTrend(rows) {
  const svg = element('trend-chart')
  clear(svg)
  if (!rows.length) {
    const label = svgNode('text', { x: 380, y: 119, 'text-anchor': 'middle', class: 'chart-label' })
    label.textContent = '当前周期暂无下载点击数据'
    svg.appendChild(label)
    return
  }
  const width = 760
  const height = 238
  const padding = { top: 18, right: 18, bottom: 34, left: 42 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const maximum = Math.max(1, ...rows.map((row) => Number(row.count) || 0))
  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + chartHeight / 3 * index
    svg.appendChild(svgNode('line', {
      x1: padding.left,
      y1: y,
      x2: width - padding.right,
      y2: y,
      class: 'axis-line',
    }))
  }
  const points = rows.map((row, index) => {
    const x = padding.left + (rows.length === 1 ? chartWidth / 2 : chartWidth * index / (rows.length - 1))
    const y = padding.top + chartHeight - (Number(row.count) || 0) / maximum * chartHeight
    return { x, y, row }
  })
  const line = points.map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y).join(' ')
  const area = line + ' L ' + points[points.length - 1].x + ' ' + (padding.top + chartHeight)
    + ' L ' + points[0].x + ' ' + (padding.top + chartHeight) + ' Z'
  svg.appendChild(svgNode('path', { d: area, class: 'trend-area' }))
  svg.appendChild(svgNode('path', { d: line, class: 'trend-line' }))
  for (const point of points) {
    const circle = svgNode('circle', {
      cx: point.x,
      cy: point.y,
      r: points.length < 20 ? 4 : 2.5,
      class: 'trend-point',
    })
    const title = svgNode('title', {})
    title.textContent = point.row.day + ': ' + formatCount(point.row.count)
    circle.appendChild(title)
    svg.appendChild(circle)
  }
  const start = svgNode('text', { x: padding.left, y: height - 8, class: 'chart-label' })
  start.textContent = dateFormat.format(new Date(rows[0].day + 'T00:00:00Z'))
  const end = svgNode('text', { x: width - padding.right, y: height - 8, 'text-anchor': 'end', class: 'chart-label' })
  end.textContent = dateFormat.format(new Date(rows[rows.length - 1].day + 'T00:00:00Z'))
  const peak = svgNode('text', { x: 4, y: padding.top + 4, class: 'chart-label' })
  peak.textContent = formatCount(maximum)
  svg.append(start, end, peak)
}

function countryLabel(code) {
  if (code === 'XX' || code === 'ZZ') return '未知地区'
  try {
    return regionNames ? regionNames.of(code) || code : code
  } catch {
    return code
  }
}

function renderCountries(rows) {
  const body = element('country-rows')
  clear(body)
  if (!rows.length) {
    const cell = document.createElement('td')
    cell.colSpan = 2
    cell.appendChild(emptyMessage('官方桌面包产生匿名活跃后，这里会显示国家或地区'))
    const row = document.createElement('tr')
    row.appendChild(cell)
    body.appendChild(row)
    return
  }
  for (const item of rows) {
    const row = document.createElement('tr')
    const region = document.createElement('td')
    const code = document.createElement('span')
    code.className = 'country-code'
    code.textContent = item.countryCode
    region.append(code, document.createTextNode(countryLabel(item.countryCode)))
    const value = document.createElement('td')
    value.textContent = formatCount(item.count)
    row.append(region, value)
    body.appendChild(row)
  }
}

function retentionCell(retained, cohortUsers) {
  if (retained === null || retained === undefined) return '--'
  if (!Number(cohortUsers)) return '0%'
  return formatPercent(Number(retained) / Number(cohortUsers) * 100)
}

function renderRetention(rows) {
  const body = element('retention-rows')
  clear(body)
  if (!rows.length) {
    const cell = document.createElement('td')
    cell.colSpan = 5
    cell.appendChild(emptyMessage('新版正式包产生匿名启动后，这里会显示留存 cohort'))
    const row = document.createElement('tr')
    row.appendChild(cell)
    body.appendChild(row)
    return
  }
  for (const item of rows.slice(0, 31)) {
    const row = document.createElement('tr')
    for (const value of [
      item.cohortDay,
      formatCount(item.cohortUsers),
      retentionCell(item.retainedD1, item.cohortUsers),
      retentionCell(item.retainedD7, item.cohortUsers),
      retentionCell(item.retainedD30, item.cohortUsers),
    ]) {
      const cell = document.createElement('td')
      cell.textContent = value
      row.appendChild(cell)
    }
    body.appendChild(row)
  }
}

function render(data) {
  setText('metric-downloads', formatCount(data.downloads.totalClicks))
  setText('metric-dau', formatCount(data.active.dau))
  setText('metric-mau', formatCount(data.active.mau))
  setText('metric-countries', formatCount(data.active.countries.length))
  setText('metric-retention-d1', formatPercent(data.retention.d1.rate))
  setText('metric-retention-d7', formatPercent(data.retention.d7.rate))
  setText('metric-retention-d30', formatPercent(data.retention.d30.rate))
  renderTrend(data.downloads.trend)
  renderCountries(data.active.countries)
  renderBars('source-bars', data.downloads.sources, (row) => sourceLabels[row.source] || row.source)
  renderBars('version-bars', data.active.versions, (row) => 'v' + row.version)
  renderBars('surface-bars', data.desktop.surfaces, (row) => surfaceLabels[row.surface] || row.surface)
  renderBars('event-bars', data.desktop.events, (row) => eventLabels[row.event] || row.event)
  renderBars('update-funnel-bars', data.funnels.updates, (row) => eventLabels[row.event] || row.event)
  renderBars('dock-funnel-bars', data.funnels.dock, (row) => eventLabels[row.event] || row.event)
  renderRetention(data.retention.cohorts)
  renderBars('duration-bars', data.usage.sessionDurations, (row) => durationLabels[row.bucket] || row.bucket)
  setText('generated-at', '更新于 ' + new Date(data.generatedAt).toLocaleString('zh-CN'))
}

async function load(days) {
  const state = element('load-state')
  state.dataset.state = 'loading'
  state.textContent = 'LOADING DATA'
  try {
    const response = await fetch('/admin/api/summary?days=' + encodeURIComponent(days), {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (response.status === 401) {
      location.reload()
      return
    }
    if (!response.ok) throw new Error('request failed')
    render(await response.json())
    state.dataset.state = 'ready'
    state.textContent = 'DATA READY'
  } catch {
    state.dataset.state = 'error'
    state.textContent = 'LOAD FAILED'
  }
}

for (const button of document.querySelectorAll('[data-days]')) {
  button.addEventListener('click', () => {
    for (const item of document.querySelectorAll('[data-days]')) item.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-pressed', 'true')
    load(button.dataset.days)
  })
}

load('30')
`

function loginPage(showError) {
  const error = showError
    ? '<p class="error" role="alert">密码不正确或请求无效，请重试。</p>'
    : ''
  return LOGIN_PAGE.replace('<!--ERROR-->', error)
}

function normalizedCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0
}

function normalizeRows(result, keys) {
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map((row) => {
    const output = {}
    for (const key of keys) output[key] = key === 'count' ? normalizedCount(row[key]) : String(row[key] ?? '')
    return output
  })
}

async function executeSummary(env, days, seams) {
  if (!env?.METRICS || typeof env.METRICS.prepare !== 'function') throw new Error('database unavailable')
  const period = '-' + (days - 1) + ' days'
  const queries = [
    DOWNLOAD_TOTAL_SQL,
    DOWNLOAD_TREND_SQL,
    DOWNLOAD_COUNTRIES_SQL,
    DOWNLOAD_SOURCES_SQL,
    DOWNLOAD_VERSIONS_SQL,
    DESKTOP_LAUNCHES_SQL,
    DESKTOP_SURFACES_SQL,
    DESKTOP_EVENTS_SQL,
    ACTIVE_DAILY_TREND_SQL,
    ACTIVE_MONTHLY_TREND_SQL,
    ACTIVE_COUNTRIES_SQL,
    ACTIVE_VERSIONS_SQL,
    UPDATE_FUNNEL_SQL,
    DOCK_FUNNEL_SQL,
    RETENTION_COHORTS_SQL,
    SESSION_DURATION_SQL,
  ].map((sql) => env.METRICS.prepare(sql).bind(period).all())
  const [
    downloadTotal,
    downloadTrend,
    downloadCountries,
    downloadSources,
    downloadVersions,
    desktopLaunches,
    desktopSurfaces,
    desktopEvents,
    activeDailyTrend,
    activeMonthlyTrend,
    activeCountries,
    activeVersions,
    updateFunnel,
    dockFunnel,
    retentionCohorts,
    sessionDurations,
  ] = await Promise.all(queries)

  const normalizedDailyTrend = normalizeRows(activeDailyTrend, ['day', 'count'])
  const normalizedMonthlyTrend = normalizeRows(activeMonthlyTrend, ['month', 'count'])
  const normalizedRetentionCohorts = normalizeRetentionRows(retentionCohorts)

  return {
    schema: 3,
    rangeDays: days,
    generatedAt: currentDate(seams).toISOString(),
    downloads: {
      totalClicks: normalizedCount(downloadTotal?.results?.[0]?.total),
      trend: normalizeRows(downloadTrend, ['day', 'count']),
      countries: normalizeRows(downloadCountries, ['countryCode', 'count']),
      sources: normalizeRows(downloadSources, ['source', 'count']),
      versions: normalizeRows(downloadVersions, ['version', 'count']),
    },
    desktop: {
      launches: normalizedCount(desktopLaunches?.results?.[0]?.total),
      surfaces: normalizeRows(desktopSurfaces, ['surface', 'count']),
      events: normalizeRows(desktopEvents, ['event', 'count']),
    },
    active: {
      dau: normalizedDailyTrend.at(-1)?.count ?? 0,
      mau: normalizedMonthlyTrend.at(-1)?.count ?? 0,
      dailyTrend: normalizedDailyTrend,
      monthlyTrend: normalizedMonthlyTrend,
      countries: normalizeRows(activeCountries, ['countryCode', 'count']),
      versions: normalizeRows(activeVersions, ['version', 'count']),
    },
    funnels: {
      updates: normalizeRows(updateFunnel, ['event', 'count']),
      dock: normalizeRows(dockFunnel, ['event', 'count']),
    },
    retention: {
      d1: retentionSummary(normalizedRetentionCohorts, 'retainedD1'),
      d7: retentionSummary(normalizedRetentionCohorts, 'retainedD7'),
      d30: retentionSummary(normalizedRetentionCohorts, 'retainedD30'),
      cohorts: normalizedRetentionCohorts,
    },
    usage: {
      sessionDurations: normalizeRows(sessionDurations, ['bucket', 'count']),
    },
  }
}

function optionalCount(value) {
  return value === null || value === undefined ? null : normalizedCount(value)
}

function normalizeRetentionRows(result) {
  const rows = Array.isArray(result?.results) ? result.results : []
  return rows.map((row) => ({
    cohortDay: String(row.cohortDay ?? ''),
    cohortUsers: normalizedCount(row.cohortUsers),
    retainedD1: optionalCount(row.retainedD1),
    retainedD7: optionalCount(row.retainedD7),
    retainedD30: optionalCount(row.retainedD30),
  }))
}

function retentionSummary(rows, key) {
  const mature = rows.filter((row) => row[key] !== null)
  const cohortUsers = mature.reduce((total, row) => total + row.cohortUsers, 0)
  const retainedUsers = mature.reduce((total, row) => total + row[key], 0)
  return {
    cohortUsers,
    retainedUsers,
    rate: cohortUsers === 0 ? null : Math.round(retainedUsers / cohortUsers * 10_000) / 100,
  }
}

function methodNotAllowed(allow) {
  return adminResponse(405, 'method not allowed', 'text/plain; charset=utf-8', { allow })
}

export async function handleAdminRequest(request, env, seams = {}) {
  if (!adminConfigured(env)) return adminResponse(404, 'not found')
  const { pathname, searchParams } = new URL(request.url)

  if (pathname === '/admin/login') {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    const password = await parseLoginPassword(request)
    if (password === null || !await passwordMatches(password, env.ADMIN_PASSWORD_SHA256)) {
      return adminResponse(401, loginPage(true), 'text/html; charset=utf-8')
    }
    const token = await createSession(env, seams)
    return redirect('/admin', sessionCookie(token))
  }

  if (pathname === '/admin/logout') {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    return redirect('/admin', clearedSessionCookie())
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    if (!await hasValidSession(request, env, seams)) {
      return adminResponse(200, loginPage(false), 'text/html; charset=utf-8')
    }
    return adminResponse(200, DASHBOARD_PAGE, 'text/html; charset=utf-8')
  }

  if (pathname === '/admin/dashboard.js') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    if (!await hasValidSession(request, env, seams)) return adminResponse(401, 'unauthorized')
    return adminResponse(200, DASHBOARD_SCRIPT, 'application/javascript; charset=utf-8')
  }

  if (pathname === '/admin/api/summary') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    if (!await hasValidSession(request, env, seams)) {
      return adminResponse(401, JSON.stringify({ error: 'unauthorized' }), 'application/json; charset=utf-8')
    }
    const days = Number.parseInt(searchParams.get('days') ?? '30', 10)
    if (!DAY_RANGES.has(days) || String(days) !== (searchParams.get('days') ?? '30')) {
      return adminResponse(400, JSON.stringify({ error: 'invalid range' }), 'application/json; charset=utf-8')
    }
    try {
      const summary = await executeSummary(env, days, seams)
      return adminResponse(200, JSON.stringify(summary), 'application/json; charset=utf-8')
    } catch {
      return adminResponse(503, JSON.stringify({ error: 'temporarily unavailable' }), 'application/json; charset=utf-8')
    }
  }

  return adminResponse(404, 'not found')
}

export const __test = Object.freeze({
  ADMIN_CSP,
  DASHBOARD_PAGE,
  DASHBOARD_SCRIPT,
  DAY_RANGES,
  RETENTION_COHORTS_SQL,
  SESSION_DURATION_SQL,
  executeSummary,
})
