import { summarizeCostMode } from './cost-mode-summary.mjs'
import { updateDiagnosticsSummary } from './update-diagnostics-summary.mjs'
import { releaseFilters, releaseSummary } from './release-analytics.mjs'
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
  'FROM download_click_daily_all',
  "WHERE day >= date('now', ?)",
].join(' ')

const DOWNLOAD_TREND_SQL = [
  'SELECT day, SUM(count) AS count',
  'FROM download_click_daily_all',
  "WHERE day >= date('now', ?)",
  'GROUP BY day ORDER BY day',
].join(' ')

const DOWNLOAD_COUNTRIES_SQL = [
  'SELECT country_code AS countryCode, SUM(count) AS count',
  'FROM download_click_daily_all',
  "WHERE day >= date('now', ?)",
  'GROUP BY country_code ORDER BY count DESC, country_code LIMIT 250',
].join(' ')

const DOWNLOAD_SOURCES_SQL = [
  'SELECT source, SUM(count) AS count',
  'FROM download_click_daily_all',
  "WHERE day >= date('now', ?)",
  'GROUP BY source ORDER BY count DESC, source',
].join(' ')

const DOWNLOAD_VERSIONS_SQL = [
  'SELECT release_version AS version, SUM(count) AS count',
  'FROM download_click_daily_all',
  "WHERE day >= date('now', ?)",
  'GROUP BY release_version ORDER BY count DESC, release_version LIMIT 30',
].join(' ')

const DESKTOP_LAUNCHES_SQL = [
  'SELECT COALESCE(SUM(count), 0) AS total',
  'FROM metric_daily_all',
  "WHERE day >= date('now', ?) AND event = 'app_launch'",
].join(' ')

const DESKTOP_SURFACES_SQL = [
  'SELECT detail AS surface, SUM(count) AS count',
  'FROM metric_daily_all',
  "WHERE day >= date('now', ?) AND event = 'surface_opened'",
  'GROUP BY detail ORDER BY count DESC, detail',
].join(' ')

const DESKTOP_EVENTS_SQL = [
  'SELECT event, SUM(count) AS count',
  'FROM metric_daily_all',
  "WHERE day >= date('now', ?) AND event NOT LIKE 'value_mode_%' AND event NOT LIKE 'cost_mode_%'",
  'GROUP BY event ORDER BY count DESC, event',
].join(' ')

const VALUE_MODE_USAGE_SQL = [
  'SELECT event, outcome, detail, SUM(count) AS count',
  'FROM metric_daily_all',
  "WHERE day >= date('now', ?) AND (event LIKE 'value_mode_%' OR event LIKE 'cost_mode_%')",
  'GROUP BY event, outcome, detail ORDER BY count DESC, event, outcome, detail',
].join(' ')

const ACTIVE_HEADLINE_SQL = [
  'WITH bounds AS (SELECT date(?) AS asOfDay)',
  'SELECT',
  '  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day = bounds.asOfDay) AS dau,',
  "  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day = date(bounds.asOfDay, '-1 day')) AS previousDau,",
  "  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day BETWEEN date(bounds.asOfDay, '-6 days') AND bounds.asOfDay) AS wau,",
  "  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day BETWEEN date(bounds.asOfDay, '-13 days') AND date(bounds.asOfDay, '-7 days')) AS previousWau,",
  "  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day BETWEEN date(bounds.asOfDay, '-29 days') AND bounds.asOfDay) AS mau,",
  "  (SELECT COUNT(DISTINCT installation_actor) FROM product_installation_daily WHERE day BETWEEN date(bounds.asOfDay, '-59 days') AND date(bounds.asOfDay, '-30 days')) AS previousMau,",
  "  (SELECT COUNT(*) FROM product_installation_first_seen WHERE first_seen_day BETWEEN date(bounds.asOfDay, '-399 days') AND bounds.asOfDay) AS totalInstallations,",
  '  (SELECT MIN(day) FROM product_installation_daily) AS activityStartedDay',
  'FROM bounds',
].join(' ')

const ACTIVE_DAILY_TREND_SQL = [
  'WITH RECURSIVE days(day) AS (',
  'SELECT date(?, ?)',
  "UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date(?)",
  ')',
  'SELECT days.day, COUNT(DISTINCT activity.installation_actor) AS count',
  'FROM days',
  'LEFT JOIN product_installation_daily activity ON activity.day = days.day',
  'GROUP BY days.day ORDER BY days.day',
].join(' ')

const ACTIVE_MAU_TREND_SQL = [
  'WITH RECURSIVE days(day) AS (',
  'SELECT date(?, ?)',
  "UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date(?)",
  ')',
  'SELECT days.day, COUNT(DISTINCT activity.installation_actor) AS count',
  'FROM days',
  "LEFT JOIN product_installation_daily activity ON activity.day BETWEEN date(days.day, '-29 days') AND days.day",
  'GROUP BY days.day ORDER BY days.day',
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
  'SELECT event, SUM(count) AS count FROM metric_daily_all',
  "WHERE day >= date('now', ?)",
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
  'FROM metric_daily_all',
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
      grid-template-columns: repeat(6, minmax(0, 1fr));
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
    .metric small em {
      display: block;
      margin-top: 4px;
      font-style: normal;
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
    }
    .metric strong {
      display: block;
      margin-top: 15px;
      font: 800 clamp(34px, 5vw, 58px)/.9 "Bahnschrift Condensed", sans-serif;
      letter-spacing: -.035em;
    }
    .metric-context {
      display: block;
      margin-top: 14px;
      color: inherit;
      opacity: .66;
      font-size: 11px;
      line-height: 1.45;
    }
    .activity-ratios {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: -1px 0 18px;
      border: 1px solid var(--ink);
      background: rgba(251, 249, 242, .9);
    }
    .activity-ratios span {
      padding: 13px 16px;
      border-right: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .activity-ratios span:last-child { border-right: 0; }
    .activity-ratios strong { color: var(--ink); }
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
    .trend-chart { display: block; width: 100%; min-height: 238px; overflow: visible; }
    .axis-line { stroke: rgba(20, 24, 23, .16); stroke-width: 1; }
    .trend-area { fill: rgba(185, 242, 39, .28); }
    .trend-line { fill: none; stroke: var(--ink); stroke-width: 3; vector-effect: non-scaling-stroke; }
    .trend-point { fill: var(--signal); stroke: var(--ink); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .chart-label { fill: var(--muted); font: 12px "Bahnschrift", sans-serif; }
    .bars { display: grid; gap: 15px; }
    #update-diagnostics-recent { max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
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
      .activity-ratios { grid-template-columns: 1fr; }
      .activity-ratios span { border-right: 0; border-bottom: 1px solid var(--line); }
      .activity-ratios span:last-child { border-bottom: 0; }
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
  <div class="topline"><span><span class="topline-wide">DSH / SIGNAL ROOM / </span>PRODUCT ANALYTICS</span><span class="live">SERVICE ONLINE</span></div>
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
      <span>DAU、WAU、MAU 只对启动事件使用稳定匿名安装实例哈希去重：DAU 为服务端 UTC 当日，WAU 为滚动 7 个 UTC 日，MAU 为滚动 30 个 UTC 日；累计安装实例统计最近 400 个 UTC 日内首次见到的实例。高频事件进入无实例标识的按小时聚合层，国家、版本和更新漏斗沿用月度匿名观察口径；拓展坞和引导转化采用事件次数。多台设备分别计数。系统不保存 IP、账号、机器码、硬件信息。仅失败保留受限诊断字段；事件计数为采样加权观察值。</span>
    </section>

    <section class="metrics" aria-label="核心指标">
      <article class="metric"><small>日活跃实例 DAU<em>UTC 今日，截至当前</em></small><strong id="metric-dau">--</strong><span class="metric-context" id="metric-dau-context">对比完整昨日</span></article>
      <article class="metric"><small>周活跃实例 WAU<em>滚动 7 个 UTC 日</em></small><strong id="metric-wau">--</strong><span class="metric-context" id="metric-wau-context">对比此前 7 日</span></article>
      <article class="metric"><small>月活跃实例 MAU<em>滚动 30 个 UTC 日</em></small><strong id="metric-mau">--</strong><span class="metric-context" id="metric-mau-context">对比此前 30 日</span></article>
      <article class="metric"><small>下载按钮点击<em>所选看板周期</em></small><strong id="metric-downloads">--</strong><span class="metric-context">次数，不等于安装人数</span></article>
      <article class="metric"><small>累计安装实例<em>最近 400 个 UTC 日</em></small><strong id="metric-total-installations">--</strong><span class="metric-context">首次启动实例去重</span></article>
      <article class="metric"><small>活跃国家或地区<em>月度匿名观察</em></small><strong id="metric-countries">--</strong><span class="metric-context">未知地区单独归类</span></article>
    </section>

    <section class="activity-ratios" aria-label="活跃质量与覆盖范围">
      <span>DAU / MAU 粘性 <strong id="metric-dau-mau">--</strong></span>
      <span>WAU / MAU 粘性 <strong id="metric-wau-mau">--</strong></span>
      <span>活跃数据覆盖 <strong id="metric-active-coverage">--</strong></span>
    </section>

    <section class="grid equal" aria-label="活跃趋势">
      <article class="panel">
        <div class="panel-head"><h2>日活跃实例趋势</h2><span>每天独立去重，UTC 日</span></div>
        <div class="panel-body chart-wrap"><svg id="active-dau-chart" class="trend-chart" viewBox="0 0 760 238" role="img" aria-label="日活跃实例趋势"></svg></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>滚动 30 日 MAU 趋势</h2><span>每天向前回看 30 个 UTC 日</span></div>
        <div class="panel-body chart-wrap"><svg id="active-mau-chart" class="trend-chart" viewBox="0 0 760 238" role="img" aria-label="滚动 30 日月活跃实例趋势"></svg></div>
      </article>
    </section>

    <section class="panel" aria-label="发布分析" style="margin-bottom:20px">
      <div class="panel-head"><h2>发布分析</h2><div>
        <label>版本 <select id="release-version"><option value="">全部版本</option><option value="3.5.0">v3.5.0</option><option value="3.4.0">v3.4.0</option><option value="3.3.0">v3.3.0</option></select></label>
        <label>周期 <select id="release-days"><option value="7">7 天</option><option value="30" selected>30 天</option><option value="90">90 天</option></select></label>
        <button id="release-export" type="button" disabled>导出 CSV</button>
      </div></div>
      <div class="panel-body">
        <p id="release-coverage" role="status">正在读取发布统计…</p>
        <p>启动实例：<strong id="release-active">--</strong> · 启动成功率：<strong id="release-startup">--</strong> <span id="release-denominator"></span></p>
        <p style="color:var(--muted);font-size:12px">次数包含重复操作，高频行为使用聚合统计。安装实例仅在保留去重数据的指标中展示，其他指标以 -- 表示。各阶段为独立观察，不代表有序转化。普通文件添加不代表消息已发送或任务已完成。下方旧报表的周期独立控制。</p>
      </div>
      <div class="table-wrap"><table><thead><tr><th>功能 / 事件</th><th>结果</th><th>细分</th><th>实例数</th><th>次数</th></tr></thead><tbody id="release-rows"></tbody></table></div>
    </section>

    <section class="grid">
      <article class="panel">
        <div class="panel-head"><h2>下载点击趋势</h2><span>UTC 日聚合</span></div>
        <div class="panel-body chart-wrap"><svg id="trend-chart" class="trend-chart" viewBox="0 0 760 238" role="img" aria-label="下载按钮点击趋势"></svg></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>下载入口</h2><span>固定官网位置</span></div>
        <div class="panel-body"><div id="source-bars" class="bars accent"></div></div>
      </article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>国家与地区活跃实例</h2><span>月度匿名观察去重</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>地区</th><th>实例数</th></tr></thead>
            <tbody id="country-rows"></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>版本采用</h2><span>月度匿名观察去重</span></div>
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

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>性价比模式使用</h2><span>选择、引导、启停与路由</span></div>
        <div class="panel-body"><p id="cost-mode-summary" class="muted"></p><div id="value-mode-bars" class="bars accent"></div></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>性价比模式口径</h2><span>仅统计固定枚举</span></div>
        <div class="panel-body">
          <p style="margin:0;color:var(--muted);font-size:13px;line-height:1.8">成功路由使用聚合计数；失败保留模型标识、角色、策略、错误类别、版本和时间用于排障。提示词、会话内容、Token 和错误原文不会进入产品分析。</p>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>更新失败诊断</h2><span>最近最多 30 天，按当前运行版本筛选</span></div>
      <div class="panel-body">
        <p id="update-diagnostics-state" class="muted">尚未加载诊断</p>
        <label>当前运行版本 <input id="update-diagnostics-version" placeholder="全部版本" maxlength="40"></label>
        <button id="update-diagnostics-refresh" type="button">查询诊断</button>
        <div id="update-diagnostics-bars" class="bars accent"></div>
        <details><summary>最近失败记录</summary><pre id="update-diagnostics-recent"></pre></details>
      </div>
    </section>

    <section class="metrics retention-metrics" aria-label="留存率">
      <article class="metric"><small>D1 留存率</small><strong id="metric-retention-d1">--</strong></article>
      <article class="metric"><small>D7 留存率</small><strong id="metric-retention-d7">--</strong></article>
      <article class="metric"><small>D30 留存率</small><strong id="metric-retention-d30">--</strong></article>
    </section>

    <section class="grid equal">
      <article class="panel">
        <div class="panel-head"><h2>应用内更新漏斗</h2><span>月度匿名观察去重</span></div>
        <div class="panel-body"><div id="update-funnel-bars" class="bars accent"></div><p class="muted">更新失败包括检查、下载、校验和安装器启动；次数不代表安装失败人数。</p></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>拓展坞漏斗</h2><span>事件次数：曝光、点击、打开、操作</span></div>
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
      <span>周期匿名观察行按 35 天和 13 个月保留；稳定安装实例活动、留存 cohort 与趋势聚合保留 400 天。累计安装实例指标只覆盖近 400 个 UTC 日。看板请求不会写入产品统计表。</span>
      <span><span id="load-state" class="load-state" data-state="loading">LOADING DATA</span><br><span id="generated-at"></span></span>
    </footer>
  </main>
  <script src="/admin/dashboard.js" defer></script>
</body>
</html>`

const DASHBOARD_SCRIPT = String.raw`'use strict'

let releaseData
let releaseRequest = 0
const releaseLabels = {
  feature_project: '项目操作', feature_attachment: '普通文件添加', feature_dock_setting: '拓展坞设置',
  started: '开始', succeeded: '成功', failed: '失败', cancelled: '取消', opened: '已打开', ready: '就绪',
  create: '新建并连接', connect: '连接已有项目', file: '普通文件', relay: '供应商接入',
  'value-mode': '性价比模式', 'personal-prompt': '个性化 Prompt', memory: '记忆', 'particle-theme': '粒子主题', 'describe-image': '图像理解',
}
function releaseLabel(value) { return releaseLabels[value] || eventLabels[value] || valueModeEventLabels[value] || value }
async function loadRelease() {
  const sequence = ++releaseRequest
  const days = element('release-days').value
  const version = element('release-version').value
  releaseData = undefined
  element('release-export').disabled = true
  element('release-rows').replaceChildren()
  setText('release-active', '--'); setText('release-startup', '--'); setText('release-denominator', '')
  setText('release-coverage', '正在读取发布统计…')
  try {
    const response = await fetch('/admin/api/release?' + new URLSearchParams({ days, version }), { credentials: 'same-origin' })
    if (sequence !== releaseRequest) return
    if (response.status === 401) { location.reload(); return }
    if (!response.ok) throw new Error('unavailable')
    const data = await response.json()
    if (sequence !== releaseRequest) return
    releaseData = data
    const select = element('release-version')
    for (const row of data.versions) {
      if ([...select.options].some(option => option.value === row.version)) continue
      const option = document.createElement('option'); option.value = row.version; option.textContent = 'v' + row.version; select.append(option)
    }
    setText('release-coverage', data.coverage.from
      ? '覆盖 UTC ' + data.coverage.from + ' 至 ' + data.coverage.to + (data.coverage.partial ? '；此窗口尚未完整覆盖。' : '；当日数据仍在更新。') + ' 计数按小时汇总；仅聚合事件的实例数显示 --。'
      : '尚无新版统计记录；等待正式客户端上报。')
    setText('release-active', numberFormat.format(data.activeInstances))
    setText('release-startup', data.startup.successRate === null ? '暂无样本' : (data.startup.successRate * 100).toFixed(1) + '%')
    setText('release-denominator', '（成功 ' + data.startup.ready + ' / 已上报结果 ' + data.startup.denominator + '）')
    const body = element('release-rows')
    for (const row of data.events) {
      const tr = document.createElement('tr')
      for (const value of [releaseLabel(row.event), releaseLabel(row.outcome), releaseLabel(row.detail), row.instances == null ? '--' : numberFormat.format(row.instances), numberFormat.format(row.count)]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td)
      }
      body.append(tr)
    }
    if (!data.events.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.textContent = '所选版本和周期暂无数据'; tr.append(td); body.append(tr)
    }
    element('release-export').disabled = !data.events.length
  } catch {
    if (sequence === releaseRequest) setText('release-coverage', '发布统计加载失败，请重新选择周期重试。')
  }
}
function exportRelease() {
  if (!releaseData) return
  const data = releaseData
  const rows = [['version','from_utc','to_utc','partial_window','event','outcome','detail','instances','count'],
    ...data.events.map(row => [data.version || 'all',data.coverage.from,data.coverage.to,data.coverage.partial,row.event,row.outcome,row.detail,row.instances,row.count])]
  const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = 'desktop-release-' + (data.version || 'all') + '-' + data.rangeDays + 'd.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
const valueModeEventLabels = Object.freeze({
  cost_mode_enter: '进入性价比模式', cost_mode_toggle: '性价比模式启停', cost_mode_strategy: '性价比模式策略', cost_mode_route: '性价比模式路由调用', cost_mode_guide: '性价比模式引导',
  value_mode_entry: '进入性价比模式',
  value_mode_onboarding: '性价比模式引导',
  value_mode_state: '性价比模式启停',
  value_mode_strategy: '性价比模式策略',
  value_mode_call: '性价比模式路由调用',
})
const valueModeOutcomeLabels = Object.freeze({
  success: '成功', failure: '失败', cancelled: '已取消',
  selected: '已选择',
  shown: '已展示',
  completed: '已完成',
  dismissed: '已关闭',
  enabled: '已开启',
  disabled: '已关闭',
  started: '已发起',
  failed: '失败',
})
const valueModeDetailLabels = Object.freeze({
  main: '专家主控', saving: '更省', stronger: '更强', unknown: '旧版未采集',
  configured: '已有配置',
  unconfigured: '待配置',
  hero: '空白会话',
  header: '会话顶部',
  settings: '完整设置',
  onboarding: '配置引导',
  manual: '手动操作',
  auto: '自动启用',
  controller: '专家主控',
  subagent: '副模型子代理',
  saver: '更省',
  balanced: '平衡',
  powerful: '更强',
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

function renderTrend(id, rows, emptyText, seriesName) {
  const svg = element(id)
  clear(svg)
  if (!rows.length) {
    const label = svgNode('text', { x: 380, y: 119, 'text-anchor': 'middle', class: 'chart-label' })
    label.textContent = emptyText
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
    title.textContent = point.row.day + ' ' + seriesName + ': ' + formatCount(point.row.count)
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

function comparisonText(current, previous, period) {
  const value = Number(current) || 0
  const baseline = Number(previous) || 0
  const difference = value - baseline
  if (baseline === 0) return difference === 0 ? period + '也是 0' : period + '为 0，本期新增 ' + formatCount(difference)
  if (difference === 0) return '较' + period + '持平'
  const sign = difference > 0 ? '+' : '-'
  const percent = Math.abs(difference / baseline * 100)
  return '较' + period + ' ' + (difference > 0 ? '+' : '') + formatCount(difference) + '（' + sign + percent.toFixed(1) + '%）'
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
  setText('metric-wau', formatCount(data.active.wau))
  setText('metric-mau', formatCount(data.active.mau))
  setText('metric-total-installations', formatCount(data.active.totalInstallations))
  setText('metric-countries', formatCount(data.active.countries.length))
  setText('metric-dau-context', comparisonText(data.active.dau, data.active.previous.dau, '昨日'))
  setText('metric-wau-context', comparisonText(data.active.wau, data.active.previous.wau, '此前 7 日'))
  setText('metric-mau-context', comparisonText(data.active.mau, data.active.previous.mau, '此前 30 日'))
  setText('metric-dau-mau', formatPercent(data.active.stickiness.dauToMau))
  setText('metric-wau-mau', formatPercent(data.active.stickiness.wauToMau))
  setText('metric-active-coverage', data.active.coverage.from ? data.active.coverage.from + ' 起，共 ' + formatCount(data.active.coverage.days) + ' 天' : '尚无启动数据')
  setText('metric-retention-d1', formatPercent(data.retention.d1.rate))
  setText('metric-retention-d7', formatPercent(data.retention.d7.rate))
  setText('metric-retention-d30', formatPercent(data.retention.d30.rate))
  renderTrend('active-dau-chart', data.active.dailyTrend, '当前周期暂无日活跃数据', 'DAU')
  renderTrend('active-mau-chart', data.active.mauTrend, '当前周期暂无滚动 MAU 数据', 'MAU')
  renderTrend('trend-chart', data.downloads.trend, '当前周期暂无下载点击数据', '下载点击')
  renderCountries(data.active.countries)
  renderBars('source-bars', data.downloads.sources, (row) => sourceLabels[row.source] || row.source)
  renderBars('version-bars', data.active.versions, (row) => 'v' + row.version)
  renderBars('surface-bars', data.desktop.surfaces, (row) => surfaceLabels[row.surface] || row.surface)
  renderBars('event-bars', data.desktop.events, (row) => eventLabels[row.event] || row.event)
  const cost = data.valueMode.summary
  if (element('cost-mode-summary')) element('cost-mode-summary').textContent = cost ? '完成调用失败率 ' + formatPercent(cost.failureRate == null ? null : cost.failureRate * 100) + '；引导完成/展示 ' + formatPercent(cost.guideCompletionRate == null ? null : cost.guideCompletionRate * 100) + '；更省/平衡/更强调用 ' + [cost.strategies.saving, cost.strategies.balanced, cost.strategies.stronger].map(formatCount).join(' / ') + '；汇总时间 ' + (data.analytics.snapshotAt || '尚未取得汇总') + '。旧版未采集成功回执；失败率不含取消和未完成调用。' : '尚未取得汇总'
  renderBars('value-mode-bars', data.valueMode.usage, (row) => [
    valueModeEventLabels[row.event] || row.event,
    valueModeOutcomeLabels[row.outcome] || row.outcome,
    valueModeDetailLabels[row.detail] || row.detail,
  ].join(' · '))
  renderBars('update-funnel-bars', data.funnels.updates, (row) => eventLabels[row.event] || row.event)
  renderBars('dock-funnel-bars', data.funnels.dock, (row) => eventLabels[row.event] || row.event)
  renderRetention(data.retention.cohorts)
  renderBars('duration-bars', data.usage.sessionDurations, (row) => durationLabels[row.bucket] || row.bucket)
  const asOf = data.active.asOfDay ? ' · 数据截至 UTC ' + data.active.asOfDay : ''
  setText('generated-at', '更新于 ' + new Date(data.generatedAt).toLocaleString('zh-CN') + asOf)
}

let diagnosticDays = 7
let diagnosticRequest = 0
async function loadUpdateDiagnostics(days = diagnosticDays) {
  const requestId = ++diagnosticRequest
  diagnosticDays = Math.min(Number(days), 30)
  const status = element('update-diagnostics-state')
  if (!status) return
  status.textContent = '正在查询更新失败诊断'
  try {
    const version = element('update-diagnostics-version').value.trim()
    const response = await fetch('/admin/api/update-diagnostics?' + new URLSearchParams({ days: String(diagnosticDays), version }), { credentials: 'same-origin' })
    if (!response.ok) throw new Error('unavailable')
    const data = await response.json()
    if (requestId !== diagnosticRequest) return
    const stages = { check: '检查更新', download: '下载安装包', verify: '校验文件', prepare: '退出旧进程', install: '启动安装器', unknown: '旧数据或未知阶段' }
    status.textContent = 'UTC ' + data.from + ' 至 ' + data.to + '：保留失败记录 ' + formatCount(data.failures) + '，含诊断 ' + formatCount(data.classifiedFailures) + '，失败尝试 ' + formatCount(data.failedAttempts) + '，可去重安装实例 ' + formatCount(data.observedInstances) + '。仅覆盖已上报诊断的版本，不是安装失败率；退出后没有回执的结果仍为未知。'
    renderBars('update-diagnostics-bars', data.groups, (row) => (stages[row.stage] || row.stage) + ' · ' + row.errorType + ' · ' + row.errorCode + ' · ' + row.sourceVersion + ' → ' + row.targetVersion)
    element('update-diagnostics-recent').textContent = JSON.stringify(data.recent, null, 2)
  } catch {
    if (requestId !== diagnosticRequest) return
    status.textContent = '诊断暂不可用；需服务端迁移及客户端新版本支持，不能解释为零失败。'
    element('update-diagnostics-bars').textContent = ''
    element('update-diagnostics-recent').textContent = ''
  }
}
element('update-diagnostics-refresh')?.addEventListener('click', () => void loadUpdateDiagnostics())

async function load(days) {
  void loadUpdateDiagnostics(days)
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

element('release-version').addEventListener('change', loadRelease)
element('release-days').addEventListener('change', loadRelease)
element('release-export').addEventListener('click', exportRelease)
loadRelease()
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
  const generatedAt = currentDate(seams)
  const asOfDay = generatedAt.toISOString().slice(0, 10)
  const period = '-' + (days - 1) + ' days'
  const queries = [
    [DOWNLOAD_TOTAL_SQL, [period]],
    [DOWNLOAD_TREND_SQL, [period]],
    [DOWNLOAD_COUNTRIES_SQL, [period]],
    [DOWNLOAD_SOURCES_SQL, [period]],
    [DOWNLOAD_VERSIONS_SQL, [period]],
    [DESKTOP_LAUNCHES_SQL, [period]],
    [DESKTOP_SURFACES_SQL, [period]],
    [DESKTOP_EVENTS_SQL, [period]],
    [VALUE_MODE_USAGE_SQL, [period]],
    [ACTIVE_HEADLINE_SQL, [asOfDay]],
    [ACTIVE_DAILY_TREND_SQL, [asOfDay, period, asOfDay]],
    [ACTIVE_MAU_TREND_SQL, [asOfDay, period, asOfDay]],
    [ACTIVE_COUNTRIES_SQL, [period]],
    [ACTIVE_VERSIONS_SQL, [period]],
    [UPDATE_FUNNEL_SQL, [period]],
    [DOCK_FUNNEL_SQL, [period]],
    [RETENTION_COHORTS_SQL, [period]],
    [SESSION_DURATION_SQL, [period]],
    ["SELECT event,outcome,detail,bucket,SUM(count) AS count FROM metric_daily_all WHERE day >= date('now', ?) AND (event LIKE 'cost_mode_%' OR event LIKE 'value_mode_%') GROUP BY event,outcome,detail,bucket", [period]],
    ["SELECT MAX(snapshot_at) AS snapshotAt, MAX(sample_interval) AS sampleInterval FROM analytics_rollup_events", []],
  ].map(([sql, bindings]) => env.METRICS.prepare(sql).bind(...bindings).all())
  const [
    downloadTotal,
    downloadTrend,
    downloadCountries,
    downloadSources,
    downloadVersions,
    desktopLaunches,
    desktopSurfaces,
    desktopEvents,
    valueModeUsage,
    activeHeadline,
    activeDailyTrend,
    activeMauTrend,
    activeCountries,
    activeVersions,
    updateFunnel,
    dockFunnel,
    retentionCohorts,
    sessionDurations,
    costModeDetails,
    analyticsStatus,
  ] = await Promise.all(queries)

  const normalizedDailyTrend = normalizeRows(activeDailyTrend, ['day', 'count'])
  const normalizedMauTrend = normalizeRows(activeMauTrend, ['day', 'count'])
  const normalizedRetentionCohorts = normalizeRetentionRows(retentionCohorts)
  const headline = activeHeadline?.results?.[0] ?? {}
  const dau = normalizedCount(headline.dau)
  const wau = normalizedCount(headline.wau)
  const mau = normalizedCount(headline.mau)
  const activityStartedDay = typeof headline.activityStartedDay === 'string' ? headline.activityStartedDay : null
  const coverageDays = activityStartedDay
    ? Math.max(0, Math.round((Date.parse(asOfDay + 'T00:00:00Z') - Date.parse(activityStartedDay + 'T00:00:00Z')) / 86_400_000) + 1)
    : 0

  return {
    schema: 6,
    rangeDays: days,
    generatedAt: generatedAt.toISOString(),
    analytics: { snapshotAt: analyticsStatus?.results?.[0]?.snapshotAt ?? null, sampleInterval: Number(analyticsStatus?.results?.[0]?.sampleInterval ?? 1), mode: 'hourly-weighted-aggregate' },
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
    valueMode: {
      usage: normalizeRows(valueModeUsage, ['event', 'outcome', 'detail', 'count']),
      summary: summarizeCostMode(costModeDetails?.results ?? []),
    },
    active: {
      asOfDay,
      definition: 'app_launch',
      windows: { dauDays: 1, wauDays: 7, mauDays: 30, timezone: 'UTC', currentDayPartial: true },
      dau,
      wau,
      mau,
      previous: {
        dau: normalizedCount(headline.previousDau),
        wau: normalizedCount(headline.previousWau),
        mau: normalizedCount(headline.previousMau),
      },
      stickiness: {
        dauToMau: mau === 0 ? null : Math.round(dau / mau * 10_000) / 100,
        wauToMau: mau === 0 ? null : Math.round(wau / mau * 10_000) / 100,
      },
      coverage: { from: activityStartedDay, to: asOfDay, days: coverageDays },
      totalInstallations: normalizedCount(headline.totalInstallations),
      totalInstallationsWindowDays: 400,
      dailyTrend: normalizedDailyTrend,
      mauTrend: normalizedMauTrend,
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

  if (pathname === '/admin/api/update-diagnostics') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    if (!await hasValidSession(request, env, seams)) return adminResponse(401, JSON.stringify({ error: 'unauthorized' }), 'application/json; charset=utf-8')
    const filters = releaseFilters(searchParams)
    if (!filters) return adminResponse(400, JSON.stringify({ error: 'invalid filters' }), 'application/json; charset=utf-8')
    try {
      return adminResponse(200, JSON.stringify(await updateDiagnosticsSummary(env.METRICS, filters, currentDate(seams))), 'application/json; charset=utf-8')
    } catch { return adminResponse(503, JSON.stringify({ error: 'temporarily unavailable' }), 'application/json; charset=utf-8') }
  }

  if (pathname === '/admin/api/release') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    if (!await hasValidSession(request, env, seams)) return adminResponse(401, JSON.stringify({ error: 'unauthorized' }), 'application/json; charset=utf-8')
    const filters = releaseFilters(searchParams)
    if (!filters) return adminResponse(400, JSON.stringify({ error: 'invalid filters' }), 'application/json; charset=utf-8')
    try {
      const data = await releaseSummary(env.METRICS, filters, currentDate(seams))
      return adminResponse(200, JSON.stringify(data), 'application/json; charset=utf-8')
    } catch { return adminResponse(503, JSON.stringify({ error: 'temporarily unavailable' }), 'application/json; charset=utf-8') }
  }

  return adminResponse(404, 'not found')
}

export const __test = Object.freeze({
  ADMIN_CSP,
  DASHBOARD_PAGE,
  DASHBOARD_SCRIPT,
  DAY_RANGES,
  ACTIVE_DAILY_TREND_SQL,
  ACTIVE_HEADLINE_SQL,
  ACTIVE_MAU_TREND_SQL,
  RETENTION_COHORTS_SQL,
  SESSION_DURATION_SQL,
  VALUE_MODE_USAGE_SQL,
  executeSummary,
})
