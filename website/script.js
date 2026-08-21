import { sumInstallerDownloads } from './release-stats.mjs'

const releaseApi = 'https://api.github.com/repos/ningbainb/deepseek-harness-desktop/releases/latest'
const releasesApi = 'https://api.github.com/repos/ningbainb/deepseek-harness-desktop/releases?per_page=100'
const repositoryApi = 'https://api.github.com/repos/ningbainb/deepseek-harness-desktop'

const siteThemeToggle = document.querySelector('[data-site-theme-toggle]')
const siteThemeLabel = document.querySelector('[data-site-theme-label]')
const themeColorMeta = document.querySelector('meta[name="theme-color"]')

function syncSiteTheme(theme, persist = false) {
  const isVivid = theme === 'vivid'
  if (isVivid) document.documentElement.dataset.siteTheme = 'vivid'
  else delete document.documentElement.dataset.siteTheme
  siteThemeToggle?.setAttribute('aria-pressed', String(isVivid))
  siteThemeToggle?.setAttribute('aria-label', isVivid ? '切回深色主题' : '切换动感亮色主题')
  if (siteThemeLabel) siteThemeLabel.textContent = isVivid ? '切回深色' : '动感亮色'
  if (themeColorMeta) themeColorMeta.content = isVivid ? '#f7f9ff' : '#0a0a0a'
  if (!persist) return
  try {
    if (isVivid) localStorage.setItem('dsh-site-theme', 'vivid')
    else localStorage.removeItem('dsh-site-theme')
  } catch {
    // The theme remains active for this page when storage is unavailable.
  }
}

syncSiteTheme(document.documentElement.dataset.siteTheme === 'vivid' ? 'vivid' : 'dark')
siteThemeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.siteTheme === 'vivid' ? 'dark' : 'vivid'
  syncSiteTheme(nextTheme, true)
})

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0) return null
  return new Intl.NumberFormat('zh-CN').format(count)
}

function formatReleaseDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    datetime: date.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date),
  }
}

function setText(selector, value) {
  if (!value) return
  document.querySelectorAll(selector).forEach(node => { node.textContent = value })
}

function setLinks(selector, value) {
  if (!value) return
  document.querySelectorAll(selector).forEach(link => { link.href = value })
}

async function hydrateLatestRelease() {
  const card = document.querySelector('[data-release-card]')
  const status = document.querySelector('[data-release-status]')
  try {
    const response = await fetch(releaseApi, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)

    const release = await response.json()
    const installer = release.assets?.find(asset => asset.name.endsWith('-x64.exe'))
    const checksum = release.assets?.find(asset => asset.name === 'SHA256SUMS.txt')
    if (!installer) throw new Error('release installer is missing')

    const version = String(release.tag_name || '').replace(/^desktop-v/, 'v')
    document.documentElement.dataset.releaseVersion = version.replace(/^v/u, '')
    setLinks('.download-link', installer.browser_download_url)
    const terminalAction = document.querySelector('#terminal-action')
    if (terminalAction) {
      terminalAction.dataset.downloadHref = installer.browser_download_url
      if (document.querySelector('[data-terminal-tab="download"]')?.classList.contains('is-active')) {
        terminalAction.href = installer.browser_download_url
      }
    }
    setLinks('.release-page-link', release.html_url)
    setLinks('.checksum-link', checksum?.browser_download_url)
    setText('.release-version', version)
    setText('.release-size', formatBytes(installer.size))

    const published = formatReleaseDate(release.published_at)
    if (published) {
      document.querySelectorAll('.release-date').forEach(node => {
        node.textContent = published.label
        node.dateTime = published.datetime
      })
    }

    const command = document.querySelector('#terminal-command')
    if (command) {
      command.dataset.downloadCommand = `下载 DeepSeek Harness Desktop ${version}`
      if (document.querySelector('[data-terminal-tab="download"]')?.classList.contains('is-active')) {
        command.textContent = command.dataset.downloadCommand
      }
    }
    if (status) status.textContent = '已同步 GitHub'
    document.documentElement.dataset.releaseSource = 'live'
  } catch {
    if (status) status.textContent = '使用内置版本信息'
    document.documentElement.dataset.releaseSource = 'fallback'
  } finally {
    card?.setAttribute('aria-busy', 'false')
  }
}

async function hydrateInstallerDownloads() {
  try {
    const response = await fetch(releasesApi, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    const releases = await response.json()
    setText('[data-download-count]', formatCount(sumInstallerDownloads(releases)))
  } catch {
    // The static cumulative count remains visible when GitHub is unavailable or rate-limited.
  }
}

async function hydrateRepositoryStats() {
  try {
    const response = await fetch(repositoryApi, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    const repository = await response.json()
    setText('[data-star-count]', formatCount(repository.stargazers_count))
  } catch {
    // Static values keep the Star guidance useful when GitHub is unavailable or rate-limited.
  }
}

async function copyText(text, feedback) {
  try {
    await navigator.clipboard.writeText(text)
    const original = feedback.textContent
    feedback.textContent = '已复制'
    window.setTimeout(() => { feedback.textContent = original }, 1400)
  } catch {
    feedback.textContent = '复制失败'
  }
}

const header = document.querySelector('[data-header]')
const syncHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 30)
syncHeader()
window.addEventListener('scroll', syncHeader, { passive: true })

const reveals = [...document.querySelectorAll('.reveal')]
const revealAll = () => reveals.forEach(element => element.classList.add('is-visible'))
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (reduceMotion || !('IntersectionObserver' in window)) {
  revealAll()
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      revealObserver.unobserve(entry.target)
    })
  }, { rootMargin: '240px 0px', threshold: 0.04 })
  reveals.forEach(element => revealObserver.observe(element))
  window.setTimeout(revealAll, 2400)
}

document.querySelectorAll('[data-terminal-tab]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-terminal-tab]').forEach(item => item.classList.remove('is-active'))
    button.classList.add('is-active')
    const command = document.querySelector('#terminal-command')
    const action = document.querySelector('#terminal-action')
    const cta = action?.querySelector('.terminal-cta')
    const isSource = button.dataset.terminalTab === 'source'
    command.textContent = isSource ? command.dataset.sourceCommand : command.dataset.downloadCommand
    if (action) {
      action.href = isSource ? action.dataset.sourceHref : action.dataset.downloadHref
      action.target = isSource ? '_blank' : ''
      action.rel = isSource ? 'noreferrer' : ''
      action.setAttribute('aria-label', isSource ? '打开 GitHub 源码仓库' : '立即下载 Windows x64 安装包')
    }
    if (cta) cta.textContent = isSource ? '打开仓库' : '立即下载'
  })
})

document.querySelector('[data-copy-target]')?.addEventListener('click', event => {
  const command = document.querySelector(`#${event.currentTarget.dataset.copyTarget}`)
  copyText(command.textContent.trim(), event.currentTarget.querySelector('span'))
})

document.querySelector('.copy-source')?.addEventListener('click', event => {
  copyText(event.currentTarget.dataset.copy, event.currentTarget.querySelector('.code-action'))
})

document.querySelectorAll('[data-copy-value]').forEach(button => {
  button.addEventListener('click', event => {
    copyText(event.currentTarget.dataset.copyValue, event.currentTarget.querySelector('[data-copy-feedback]'))
  })
})

document.querySelectorAll('[data-theme-image]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-theme-image]').forEach(item => item.classList.remove('is-active'))
    button.classList.add('is-active')
    const preview = document.querySelector('[data-theme-preview]')
    preview.style.opacity = '0'
    window.setTimeout(() => {
      preview.src = button.dataset.themeImage
      preview.style.opacity = '1'
    }, 180)
  })
})

const scheduleGitHubHydration = () => {
  const hydrate = () => Promise.allSettled([
    hydrateLatestRelease(),
    hydrateInstallerDownloads(),
    hydrateRepositoryStats(),
  ])
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(hydrate, { timeout: 1800 })
  } else {
    window.setTimeout(hydrate, 500)
  }
}

if (document.readyState === 'complete') scheduleGitHubHydration()
else window.addEventListener('load', scheduleGitHubHydration, { once: true })
