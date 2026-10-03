/**
 * Abyssal Maid Atelier (maid-atelier) skin hooks — the trusted escape
 * hatch of the v2 skin contract (x-org.linxin666.skin-center/v1alpha1),
 * reviewed and released with this repository. Loading this module
 * executes nothing; apply() owns every DOM write and registers its
 * retraction through ctx.onCleanup.
 *
 * Port of the v1 plugin effects
 * (packages/skins/maid-atelier/src/client/index.ts):
 *  - the JS-built stylesheet inputs: v1 interpolated 16 inline image
 *    constants into body CSS variables, the theme-swapped palace
 *    backdrop and a CSSOM width sheet. All 16 images now ship as files
 *    under assets/ and are referenced through ctx.assetBase. They stay
 *    on body inline styles / a hooks-owned <style> element instead of
 *    patches.css because the v2 pipeline inlines served CSS into a
 *    <style> tag without rewriting relative url() — a relative
 *    assets/... URL there would resolve against the document base and
 *    404. The dynamic sidebar-width rules must stay CSSOM rules
 *    regardless (per-frame writes that no attribute mutation observer
 *    sees, per the v1 note below).
 *  - the ornamental chrome: character stage, top/bottom trims, sidebar
 *    corners + mascot, workspace-tree decoration, titlebar brand, the
 *    settings backdrop frame and the projected-state body attributes —
 *    all driven by the same MutationObserver checkpoint logic as v1.
 *  - system chrome color (meta[name=theme-color]), the rail-search focus
 *    recovery, the low-power fallback (no accelerated WebGL), the
 *    viewport-resize settle flag, the favicon and the pinned title.
 * The stylesheet scoping attribute v1 wrote (body[data-dsh-maid-atelier])
 * is loader-owned in v2 (html[data-dsh-skin="maid-atelier"]); the
 * CSSOM frame rules below are re-anchored on that scope via
 * ctx.scopeAttr. Everything else keeps the v1 selectors and conditions.
 */

const SKIN_TITLE = '深海女仆工坊 · DeepSeek Harness'
const SKIN_OWNER = 'maid-atelier'
const SKIN_SYSTEM_CHROME_COLOR = '#0b193f'
const VIEWPORT_RESIZE_SETTLE_MS = 120
const SIDEBAR_COLUMN_SELECTOR = ":is([data-pane='sidebar'], [class*='sidebarCol'])"
const SETTINGS_TRIGGER_SELECTOR = "[data-slot='sidebar.settings'] > :is(button, [role='button'])"
const SETTINGS_MASK_SELECTOR = "[role='presentation'] > [class*='mask']"
const ACTIVE_CONVERSATION_SELECTOR = "[data-phase='active']"
const ACTIVE_CHAT_SELECTOR = `${ACTIVE_CONVERSATION_SELECTOR} [data-chat-flow]`
const WORKSPACE_SELECTOR = "header [role='tablist']"
const BETTER_SIDEBAR_SELECTOR = '[data-dsh-better-sidebar]'
const CORDIS_PANEL_SELECTOR = '[data-cordis-panel]'
const TERMINAL_SELECTOR = `${BETTER_SIDEBAR_SELECTOR} .xterm`

const bodyAttributeLeases = new WeakMap()

function createBodyAttributeLease(body, attribute, value = '') {
  const owner = Symbol(attribute)
  let active = false

  return {
    acquire() {
      if (active) return
      let attributes = bodyAttributeLeases.get(body)
      if (attributes === undefined) {
        attributes = new Map()
        bodyAttributeLeases.set(body, attributes)
      }
      let state = attributes.get(attribute)
      if (state === undefined) {
        state = {
          originalValue: body.getAttribute(attribute),
          owners: new Set(),
          value,
        }
        attributes.set(attribute, state)
      }
      state.owners.add(owner)
      active = true
      body.setAttribute(attribute, state.value)
    },
    release() {
      if (!active) return
      active = false
      const attributes = bodyAttributeLeases.get(body)
      const state = attributes?.get(attribute)
      if (state === undefined || !state.owners.delete(owner)) return
      if (state.owners.size > 0) {
        body.setAttribute(attribute, state.value)
        return
      }
      attributes?.delete(attribute)
      if (attributes?.size === 0) bodyAttributeLeases.delete(body)
      if (body.getAttribute(attribute) !== state.value) return
      if (state.originalValue === null) body.removeAttribute(attribute)
      else body.setAttribute(attribute, state.originalValue)
    },
  }
}

const PROJECTED_STATE_ATTRIBUTES = {
  activeChat: 'data-maid-chat-active',
  activeConversation: 'data-maid-conversation-active',
  betterSidebarOpen: 'data-maid-better-sidebar-open',
  cordisPanelOpen: 'data-maid-cordis-panel-open',
  settingsOpen: 'data-maid-settings-open',
  workspace: 'data-maid-workspace',
}

const PROJECTED_STATE_SELECTOR = [
  ACTIVE_CONVERSATION_SELECTOR,
  '[data-chat-flow]',
  WORKSPACE_SELECTOR,
  BETTER_SIDEBAR_SELECTOR,
  CORDIS_PANEL_SELECTOR,
  "[data-slot='sidebar.settings']",
].join(', ')

const BACKDROP_PROPERTIES = [
  'background-image',
  'background-position',
  'background-size',
  'background-attachment',
  'background-repeat',
  '--maid-sidebar-width',
  '--maid-top-trim-art',
  '--maid-bottom-trim-art',
  '--maid-bottom-crest-art',
  '--maid-bow-art',
  '--maid-new-session-art',
  '--maid-sidebar-swag-art',
  '--maid-sidebar-corner-art',
  '--maid-composer-frame-art',
  '--maid-settings-frame-art',
  '--maid-workspace-crest-art',
  '--maid-workspace-ribbon-art',
]

function hasAcceleratedWebGL() {
  if (typeof WebGLRenderingContext === 'undefined') return false
  const canvas = document.createElement('canvas')
  const options = { failIfMajorPerformanceCaveat: true }
  for (const kind of ['webgl2', 'webgl']) {
    try {
      const context = canvas.getContext(kind, options)
      if (context === null) continue
      context.getExtension('WEBGL_lose_context')?.loseContext()
      return true
    } catch {
      // A blocked or software-only context should use the CPU-safe CSS path.
    }
  }
  return false
}

function createSidebarCorners() {
  const corners = document.createElement('div')
  corners.dataset.skinChrome = 'sidebar-corners'
  corners.dataset.skinOwner = SKIN_OWNER
  corners.setAttribute('aria-hidden', 'true')
  for (const position of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
    const corner = document.createElement('span')
    corner.dataset.skinCorner = position
    corners.append(corner)
  }
  return corners
}

/**
 * Place a text label at the center of the frameless title bar (Web-app
 * overlay / desktop shell).
 */
function decorateTitlebarBrand(ownedNodes) {
  const titlebar = document.querySelector("[class*='titlebar']")
  if (!titlebar) return
  if (titlebar.querySelector("[data-skin-chrome='titlebar-brand']")) return
  const brand = document.createElement('span')
  brand.dataset.skinChrome = 'titlebar-brand'
  brand.dataset.skinOwner = SKIN_OWNER
  brand.setAttribute('aria-hidden', 'true')
  brand.textContent = 'DeepSeek Harness'
  ownedNodes.add(brand)
  titlebar.prepend(brand)
}

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const asset = (name) => `${ctx.assetBase}/assets/${name}`
      const body = document.body
      const originalTitle = document.title
      const viewportResizeLease = createBodyAttributeLease(body, 'data-maid-viewport-resizing')
      const lowPowerLease = createBodyAttributeLease(body, 'data-maid-low-power')
      // Whether body carried an inline style attribute before apply; the
      // cleanup drops an emptied attribute so teardown is byte-clean.
      const hadStyleAttribute = body.hasAttribute('style')
      const previous = new Map()
      for (const property of BACKDROP_PROPERTIES) {
        previous.set(property, body.style.getPropertyValue(property))
      }
      const previousProjectedStates = new Map()
      for (const attribute of Object.values(PROJECTED_STATE_ATTRIBUTES)) {
        previousProjectedStates.set(attribute, body.getAttribute(attribute))
      }

      const ownedNodes = new Set()
      const decoratedElements = new Set()
      let themeColorMeta = null
      let previousThemeColor
      let themeColorObserver
      let observedSidebar
      let resizeObserver
      let composerPhase
      let composerMotionTimer
      let viewportResizeTimer
      let handleViewportResize
      let railSearchFocusFrame
      let recoverRailSearchFocus
      let settingsBackdropFrame
      let observer
      let titlebarOverlay
      let syncTitlebarHeight

      // Registered first (as the v1 effect was) so a mid-apply failure
      // still retracts every write made so far.
      ctx.onCleanup(() => {
        delete body.dataset.maidComposerMotion
        delete body.dataset.maidSidebarCompact
        delete body.dataset.maidSidebarSize
        for (const [attribute, value] of previousProjectedStates) {
          if (value === null) body.removeAttribute(attribute)
          else body.setAttribute(attribute, value)
        }
        if (composerMotionTimer !== undefined) clearTimeout(composerMotionTimer)
        if (viewportResizeTimer !== undefined) clearTimeout(viewportResizeTimer)
        if (handleViewportResize !== undefined) window.removeEventListener('resize', handleViewportResize)
        viewportResizeLease.release()
        lowPowerLease.release()
        if (railSearchFocusFrame !== undefined) cancelAnimationFrame(railSearchFocusFrame)
        if (recoverRailSearchFocus !== undefined) {
          document.removeEventListener('click', recoverRailSearchFocus)
        }
        observer?.disconnect()
        themeColorObserver?.disconnect()
        if (titlebarOverlay !== undefined && syncTitlebarHeight !== undefined) {
          titlebarOverlay.removeEventListener('geometrychange', syncTitlebarHeight)
        }
        resizeObserver?.disconnect()
        for (const [property, value] of previous) {
          body.style.setProperty(property, value)
        }
        if (!hadStyleAttribute && body.style.length === 0) body.removeAttribute('style')
        ownedNodes.forEach((element) => element.remove())
        decoratedElements.forEach((element) => {
          delete element.dataset.maidSidebarFooter
          delete element.dataset.maidWorkspaceGroup
          delete element.dataset.maidWorkspaceRow
          delete element.dataset.maidWorkspaceActive
          delete element.dataset.maidSessionRow
          delete element.dataset.maidSessionFlat
          delete element.dataset.maidSessionFirst
          delete element.dataset.maidSessionLast
        })
        if (themeColorMeta?.isConnected && themeColorMeta.content === SKIN_SYSTEM_CHROME_COLOR) {
          themeColorMeta.content = previousThemeColor ?? ''
        }
        if (document.title === SKIN_TITLE) document.title = originalTitle
      })

      handleViewportResize = () => {
        viewportResizeLease.acquire()
        if (viewportResizeTimer !== undefined) clearTimeout(viewportResizeTimer)
        viewportResizeTimer = setTimeout(() => {
          viewportResizeLease.release()
          viewportResizeTimer = undefined
        }, VIEWPORT_RESIZE_SETTLE_MS)
      }
      window.addEventListener('resize', handleViewportResize)
      if (!hasAcceleratedWebGL()) lowPowerLease.acquire()

      const syncSystemChrome = () => {
        const meta = document.head.querySelector('meta[name="theme-color"]')
        if (meta === null) return
        if (meta !== themeColorMeta) {
          themeColorMeta = meta
          previousThemeColor = meta.content
        }
        if (meta.content !== SKIN_SYSTEM_CHROME_COLOR) meta.content = SKIN_SYSTEM_CHROME_COLOR
      }
      themeColorObserver = new MutationObserver(syncSystemChrome)
      themeColorObserver.observe(document.head, {
        attributes: true,
        attributeFilter: ['content'],
        childList: true,
        subtree: true,
      })
      syncSystemChrome()

      // The ornamental raster assets the compiled patches.css references
      // through these variables (v1 interpolated data URLs; v2 serves
      // files from assets/, so the URLs are absolute under assetBase —
      // relative URLs would break inside the inlined <style> pipeline).
      body.style.setProperty('--maid-top-trim-art', `url(${asset('maid-top-trim-tile-v1.webp')})`)
      body.style.setProperty('--maid-bottom-trim-art', `url(${asset('maid-bottom-trim-tile-v1.webp')})`)
      body.style.setProperty('--maid-bottom-crest-art', `url(${asset('maid-bottom-crest-v1.webp')})`)
      body.style.setProperty('--maid-bow-art', `url(${asset('maid-bow-v1.webp')})`)
      body.style.setProperty('--maid-new-session-art', `url(${asset('maid-new-session-v1.webp')})`)
      body.style.setProperty('--maid-sidebar-swag-art', `url(${asset('maid-sidebar-swag-v1.webp')})`)
      body.style.setProperty('--maid-sidebar-corner-art', `url(${asset('maid-sidebar-corner-v1.webp')})`)
      body.style.setProperty('--maid-composer-frame-art', `url(${asset('maid-composer-frame-v4.webp')})`)
      body.style.setProperty('--maid-settings-frame-art', `url(${asset('maid-settings-frame-v1.webp')})`)
      body.style.setProperty('--maid-workspace-crest-art', `url(${asset('maid-workspace-shield-v2.webp')})`)
      body.style.setProperty('--maid-workspace-ribbon-art', `url(${asset('maid-workspace-ribbon-v2.webp')})`)

      const syncBackdrop = () => {
        const source = ctx.theme.get() === 'dark'
          ? asset('maid-atelier-palace-night-v4.webp')
          : asset('maid-atelier-palace-day-v4.webp')
        body.style.setProperty('background-image', `url(${source})`)
      }
      syncBackdrop()
      body.style.setProperty('background-position', 'center top')
      body.style.setProperty('background-size', 'cover')
      body.style.setProperty('background-attachment', 'scroll')
      body.style.setProperty('background-repeat', 'no-repeat')

      // 宽度联动写入独立的 <style> 规则而非 body style：CSSOM 修改不产生
      // attribute mutation，Chrome autofill 的 MutationObserver 不会逐帧触发，
      // 因此可以每帧跟随侧边栏宽度（幕布瞬移跟手）而无需防抖节流。
      const widthSheet = document.createElement('style')
      widthSheet.dataset.skinChrome = 'sidebar-width-rule'
      widthSheet.dataset.skinOwner = SKIN_OWNER
      ownedNodes.add(widthSheet)
      document.head.append(widthSheet)
      const scope = `html[data-dsh-skin="${ctx.scopeAttr}"]`
      widthSheet.sheet.insertRule(`${scope} body { --maid-sidebar-width: 280px; --maid-sidebar-swag-height: 72.1px; --maid-sidebar-mascot-width: 229.6px; --maid-titlebar-height: 0px; }`)
      // The official frame rules reference env(titlebar-area-height), but the
      // CSS-modules pipeline rewrites the env() identifier there too, so the
      // title-bar row silently falls back to an auto row: expanding the sidebar
      // is fine, but collapsing it lets the content row's max-content grow and
      // stretches the title-bar row to hundreds of pixels. Re-assert the rows
      // here through CSSOM, where env() survives verbatim (fallback 40px keeps
      // the headless/plain-tab mock sane), and pin the drag handles to the same
      // boundary. The v1 body[data-dsh-maid-atelier] anchor is the loader-owned
      // html[data-dsh-skin] scope in v2.
      // insertRule defaults to index 0, which would push the body rule aside and
      // orphan the widthRule reference; append explicitly so cssRules[0] stays
      // the body variable rule.
      const appendRule = (rule) => {
        widthSheet.sheet.insertRule(rule, widthSheet.sheet.cssRules.length)
      }
      appendRule(`${scope} [class*="frame"][data-wco] { grid-template-rows: env(titlebar-area-height, 40px) 1fr; }`)
      appendRule(`${scope} [class*="frame"][data-desktop] { grid-template-rows: 32px 1fr; }`)
      appendRule(`${scope} [class*="frame"] [class*="handle"] { top: var(--maid-titlebar-height, 0px); }`)

      const widthRule = widthSheet.sheet.cssRules[0]
      // The curtain is position:fixed, so it needs the viewport-space top of
      // the frame's title-bar row. Measuring the sidebar column (the row below
      // it) is authoritative: whatever the title-bar height is — WCO env(), the
      // desktop 32px row, or a scaled window — the curtain lands exactly on the
      // rendered boundary, never a pixel off.
      syncTitlebarHeight = () => {
        const columns = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
        if (columns !== null) {
          const top = columns.getBoundingClientRect().top
          if (top > 0) {
            widthRule.style.setProperty('--maid-titlebar-height', `${top}px`)
            return
          }
        }
        // Desktop shell: fixed 32px row (columns not laid out yet).
        if (document.querySelector("[class*='frame'][data-desktop]") !== null) {
          widthRule.style.setProperty('--maid-titlebar-height', '32px')
          return
        }
        widthRule.style.setProperty('--maid-titlebar-height', '0px')
      }
      titlebarOverlay = navigator.windowControlsOverlay
      titlebarOverlay?.addEventListener('geometrychange', syncTitlebarHeight)
      syncTitlebarHeight()

      const applySidebarWidth = (width) => {
        if (width <= 0) return
        const roundPx = (value) => `${Math.round(value * 100) / 100}px`
        widthRule.style.setProperty('--maid-sidebar-width', roundPx(width))
        widthRule.style.setProperty('--maid-sidebar-swag-height', roundPx(Math.min(94, Math.max(54, width * 0.2575))))
        widthRule.style.setProperty('--maid-sidebar-mascot-width', roundPx(Math.min(320, width * 0.82)))
        body.dataset.maidSidebarSize = width <= 120 ? 'rail' : width <= 220 ? 'narrow' : 'wide'
        if (width <= 104) body.dataset.maidSidebarCompact = ''
        else delete body.dataset.maidSidebarCompact
      }

      const clearSidebarWidth = () => {
        widthRule.style.setProperty('--maid-sidebar-width', '0px')
        widthRule.style.setProperty('--maid-sidebar-swag-height', '54px')
        widthRule.style.setProperty('--maid-sidebar-mascot-width', '0px')
        body.dataset.maidSidebarSize = 'rail'
        body.dataset.maidSidebarCompact = ''
      }

      const syncProjectedState = () => {
        const set = (attribute, active) => {
          body.toggleAttribute(attribute, active)
        }
        set(
          PROJECTED_STATE_ATTRIBUTES.activeChat,
          document.querySelector(ACTIVE_CHAT_SELECTOR) !== null,
        )
        set(
          PROJECTED_STATE_ATTRIBUTES.activeConversation,
          document.querySelector(ACTIVE_CONVERSATION_SELECTOR) !== null,
        )
        set(
          PROJECTED_STATE_ATTRIBUTES.workspace,
          document.querySelector(WORKSPACE_SELECTOR) !== null,
        )
        set(
          PROJECTED_STATE_ATTRIBUTES.betterSidebarOpen,
          document.querySelector(BETTER_SIDEBAR_SELECTOR) !== null
            && !body.hasAttribute('data-dsh-sidebar-collapsed'),
        )
        set(
          PROJECTED_STATE_ATTRIBUTES.cordisPanelOpen,
          document.querySelector(CORDIS_PANEL_SELECTOR) !== null,
        )
        set(
          PROJECTED_STATE_ATTRIBUTES.settingsOpen,
          document.querySelector(`${SETTINGS_TRIGGER_SELECTOR}[aria-expanded='true']`) !== null,
        )
      }

      const ensureSidebarObserved = () => {
        const sidebar = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
        if (!resizeObserver || sidebar === observedSidebar) return
        if (!sidebar) {
          if (observedSidebar) resizeObserver.unobserve(observedSidebar)
          observedSidebar = undefined
          return
        }
        if (observedSidebar) resizeObserver.unobserve(observedSidebar)
        observedSidebar = sidebar
        resizeObserver.observe(sidebar)
      }

      /* rc.6 can mount its wide search and its outside-click listener during the
         rail button's own click. That same event then reaches document with the
         detached rail button as its target and immediately collapses the field.
         Re-enter the component through its wide search root after the slide has
         mounted; newer workspace builds already keep the wide field open, so the
         rail-only origin check makes this compatibility path inert there. */
      recoverRailSearchFocus = (event) => {
        const target = event.target instanceof Element
          ? event.target.closest("button[class*='searchButton']")
          : null
        const railSearch = target?.closest("[class*='search']")
        if (target === null || railSearch == null
          || railSearch.querySelector("input[class*='searchInput']") !== null) return

        if (railSearchFocusFrame !== undefined) cancelAnimationFrame(railSearchFocusFrame)
        const startedAt = performance.now()
        const recover = () => {
          railSearchFocusFrame = undefined
          const input = document.querySelector(
            `${SIDEBAR_COLUMN_SELECTOR} input[class*='searchInput']`,
          )
          const searchRoot = input?.closest("[class*='search']")
          if (input !== null && input !== undefined && searchRoot !== null && searchRoot !== undefined) {
            searchRoot.click()
            input.focus({ preventScroll: true })
            return
          }
          if (performance.now() - startedAt < 500) {
            railSearchFocusFrame = requestAnimationFrame(recover)
          }
        }
        railSearchFocusFrame = requestAnimationFrame(recover)
      }
      document.addEventListener('click', recoverRailSearchFocus)

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries.at(-1)
          if (!entry) return
          applySidebarWidth(entry.contentRect.width)
        })
      }

      const syncComposerMotion = () => {
        const phaseRoot = document.querySelector("[data-phase='hero'], [data-phase='active']")
        const next = phaseRoot?.dataset.phase
        if (next !== 'hero' && next !== 'active') return

        if (composerPhase !== undefined && composerPhase !== next) {
          body.dataset.maidComposerMotion = next === 'active' ? 'dock' : 'rise'
          if (composerMotionTimer !== undefined) clearTimeout(composerMotionTimer)
          composerMotionTimer = setTimeout(() => {
            delete body.dataset.maidComposerMotion
            composerMotionTimer = undefined
          }, 560)
        }
        composerPhase = next
      }

      /* The settings mask is mounted inside a promoted sidebar descendant. Chrome
         can omit sibling composited layers from that backdrop sample, so seat a
         copy of the existing frame immediately before the mask while it is open. */
      const syncSettingsBackdropFrame = () => {
        const expanded = document.querySelector(
          `${SETTINGS_TRIGGER_SELECTOR}[aria-expanded='true']`,
        )
        const mask = expanded === null
          ? null
          : document.querySelector(SETTINGS_MASK_SELECTOR)
        const overlay = mask?.parentElement
        if (overlay === undefined || overlay === null) {
          settingsBackdropFrame?.remove()
          return
        }

        if (settingsBackdropFrame === undefined) {
          settingsBackdropFrame = createSidebarCorners()
          settingsBackdropFrame.dataset.maidSettingsBackdropFrame = ''
          ownedNodes.add(settingsBackdropFrame)
        }
        if (settingsBackdropFrame.parentElement !== overlay) {
          overlay.insertBefore(settingsBackdropFrame, mask)
        }
      }

      const createCharacterStage = () => {
        const stage = document.createElement('div')
        stage.dataset.skinChrome = 'character-stage'
        stage.dataset.skinOwner = SKIN_OWNER
        stage.setAttribute('aria-hidden', 'true')

        const left = document.createElement('img')
        left.dataset.maidCharacter = 'left'
        left.alt = ''
        left.src = asset('maid-atelier-maid-left-v5.webp')

        const right = document.createElement('img')
        right.dataset.maidCharacter = 'right'
        right.alt = ''
        right.src = asset('maid-atelier-maid-right-v6.webp')

        stage.append(left, right)
        return stage
      }

      const decorateSidebar = (owned, decorated) => {
        const sidebar = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
        const sidebarRoot = sidebar?.querySelector(':scope > div')
        if (!sidebar || !sidebarRoot) return

        sidebar.querySelectorAll('[data-maid-sidebar-footer]').forEach((element) => {
          delete element.dataset.maidSidebarFooter
        })
        const settingsSlot = sidebar.querySelector("[data-slot='sidebar.settings']")
        if (settingsSlot) {
          let footer = settingsSlot.parentElement
          while (footer && footer !== sidebar) {
            if (footer.querySelector("[data-slot='sidebar.footer.action']")) {
              footer.dataset.maidSidebarFooter = ''
              decorated.add(footer)
              break
            }
            footer = footer.parentElement
          }
        }

        if (!sidebarRoot.querySelector("[data-skin-chrome='sidebar-corners']")) {
          const corners = createSidebarCorners()
          owned.add(corners)
          sidebarRoot.prepend(corners)
        }

        if (!sidebarRoot.querySelector("[data-skin-chrome='sidebar-mascot']")) {
          const mascot = document.createElement('img')
          mascot.dataset.skinChrome = 'sidebar-mascot'
          mascot.dataset.skinOwner = SKIN_OWNER
          mascot.setAttribute('aria-hidden', 'true')
          mascot.alt = ''
          mascot.src = asset('maid-chibi-v1.webp')
          owned.add(mascot)
          sidebarRoot.prepend(mascot)
        }
      }

      const decorateWorkspaceTree = (decorated) => {
        const sidebar = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
        if (!sidebar) return

        sidebar.querySelectorAll(
          '[data-maid-workspace-group], [data-maid-workspace-row], [data-maid-workspace-active], [data-maid-session-row], [data-maid-session-flat], [data-maid-session-first], [data-maid-session-last]',
        ).forEach((element) => {
          delete element.dataset.maidWorkspaceGroup
          delete element.dataset.maidWorkspaceRow
          delete element.dataset.maidWorkspaceActive
          delete element.dataset.maidSessionRow
          delete element.dataset.maidSessionFlat
          delete element.dataset.maidSessionFirst
          delete element.dataset.maidSessionLast
        })

        sidebar.querySelectorAll("[role='tree']").forEach((tree) => {
          const rows = [...tree.querySelectorAll("[role='treeitem']")]
          if (tree.matches("[class*='flatList']") && !rows.some((row) => row.hasAttribute('aria-expanded'))) {
            rows.filter((row) => row.hasAttribute('aria-selected')).forEach((sessionRow) => {
              sessionRow.dataset.maidSessionRow = ''
              sessionRow.dataset.maidSessionFlat = ''
              decorated.add(sessionRow)
            })
            return
          }

          let workspaceRow
          let sessionRows = []
          const decorateGroup = () => {
            if (!workspaceRow) return

            workspaceRow.dataset.maidWorkspaceRow = ''
            decorated.add(workspaceRow)
            if (workspaceRow.parentElement) {
              workspaceRow.parentElement.dataset.maidWorkspaceGroup = ''
              decorated.add(workspaceRow.parentElement)
            }
            sessionRows.forEach((sessionRow) => {
              sessionRow.dataset.maidSessionRow = ''
              decorated.add(sessionRow)
            })
            if (sessionRows[0]) sessionRows[0].dataset.maidSessionFirst = ''
            if (sessionRows.at(-1)) sessionRows.at(-1).dataset.maidSessionLast = ''

            const containsCurrent = workspaceRow.getAttribute('aria-expanded') === 'true'
              && sessionRows.some((sessionRow) => sessionRow.getAttribute('aria-selected') === 'true')
            if (containsCurrent) workspaceRow.dataset.maidWorkspaceActive = ''
          }

          rows.forEach((row) => {
            if (row.hasAttribute('aria-expanded')) {
              decorateGroup()
              workspaceRow = row
              sessionRows = []
            } else if (workspaceRow && row.hasAttribute('aria-selected')) {
              sessionRows.push(row)
            }
          })
          decorateGroup()
        })
      }

      decorateTitlebarBrand(ownedNodes)
      decorateSidebar(ownedNodes, decoratedElements)
      decorateWorkspaceTree(decoratedElements)
      ensureSidebarObserved()
      const initialSidebar = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
      if (initialSidebar) applySidebarWidth(initialSidebar.getBoundingClientRect().width)
      syncComposerMotion()
      syncSettingsBackdropFrame()
      syncProjectedState()

      const characterStage = createCharacterStage()
      ownedNodes.add(characterStage)
      body.prepend(characterStage)

      const syncSidebarDecorations = () => {
        syncTitlebarHeight?.()
        decorateTitlebarBrand(ownedNodes)
        decorateSidebar(ownedNodes, decoratedElements)
        decorateWorkspaceTree(decoratedElements)
        ensureSidebarObserved()
        const sidebar = document.querySelector(SIDEBAR_COLUMN_SELECTOR)
        if (sidebar === null) clearSidebarWidth()
        else if (resizeObserver === undefined) applySidebarWidth(sidebar.getBoundingClientRect().width)
      }

      const isSkinChrome = (node) => (
        node instanceof Element && node.getAttribute('data-skin-owner') === SKIN_OWNER
      )

      const nodeTouches = (node, selector) => (
        node instanceof Element && (node.matches(selector) || node.querySelector(selector) !== null)
      )
      const sidebarChromeSelector = `${SIDEBAR_COLUMN_SELECTOR}, [class*='titlebar']`
      const composerSelector = "[data-phase='hero'], [data-phase='active']"

      // ResizeObserver writes the animated width through CSSOM, so it never enters
      // this observer. Keep structural decoration in the MutationObserver checkpoint
      // before paint: delaying every change made the wide/rail hand-off visibly late.
      // Skin-owned insertions are ignored so decorating a React-owned node cannot
      // schedule a redundant whole-sidebar pass.
      observer = new MutationObserver((records) => {
        let sidebarStructureChanged = false
        let workspaceStateChanged = false
        let backdropChanged = false
        let composerChanged = false
        let settingsStateChanged = false
        let projectedStateChanged = false
        for (const record of records) {
          const target = record.target instanceof Element ? record.target : undefined
          if (target?.closest(TERMINAL_SELECTOR) !== null) continue

          if (record.type === 'attributes') {
            if (record.attributeName === 'aria-expanded'
              && target !== undefined
              && target.closest("[data-slot='sidebar.settings']") !== null) {
              settingsStateChanged = true
              projectedStateChanged = true
            } else if ((record.attributeName === 'aria-expanded' || record.attributeName === 'aria-selected')
              && target !== undefined && target.closest(SIDEBAR_COLUMN_SELECTOR) !== null) {
              workspaceStateChanged = true
            } else if (record.attributeName === 'data-ds-dark-theme' && record.target === body) {
              backdropChanged = true
            } else if (record.attributeName === 'data-phase') {
              composerChanged = true
            }
            if (record.attributeName === 'data-phase'
              || record.attributeName === 'data-chat-flow'
              || record.attributeName === 'data-dsh-better-sidebar'
              || record.attributeName === 'data-dsh-sidebar-collapsed'
              || record.attributeName === 'data-cordis-panel'
              || record.attributeName === 'data-slot'
              || record.attributeName === 'role') {
              projectedStateChanged = true
            }
            continue
          }
          const appNodes = [...record.addedNodes, ...record.removedNodes]
            .filter((node) => node instanceof Element && !isSkinChrome(node))
          if (appNodes.length > 0 && (appNodes.some((node) => nodeTouches(node, sidebarChromeSelector))
            || (target !== undefined && target.closest(SIDEBAR_COLUMN_SELECTOR) !== null))) {
            sidebarStructureChanged = true
          }
          if (appNodes.length > 0 && (appNodes.some((node) => nodeTouches(node, composerSelector))
            || (target !== undefined && target.closest(composerSelector) !== null))) {
            composerChanged = true
          }
          if (appNodes.some((node) => nodeTouches(node, SETTINGS_MASK_SELECTOR))) {
            settingsStateChanged = true
          }
          if (appNodes.length > 0 && (appNodes.some((node) => nodeTouches(node, PROJECTED_STATE_SELECTOR))
            || target?.matches("header, [data-slot='sidebar.settings']") === true)) {
            projectedStateChanged = true
          }
        }
        if (projectedStateChanged) syncProjectedState()
        if (sidebarStructureChanged) syncSidebarDecorations()
        else if (workspaceStateChanged) decorateWorkspaceTree(decoratedElements)
        if (backdropChanged) syncBackdrop()
        if (composerChanged) {
          syncComposerMotion()
        }
        if (settingsStateChanged) syncSettingsBackdropFrame()
      })
      observer.observe(body, {
        attributes: true,
        attributeFilter: [
          'aria-expanded',
          'aria-selected',
          'data-chat-flow',
          'data-cordis-panel',
          'data-ds-dark-theme',
          'data-dsh-better-sidebar',
          'data-dsh-sidebar-collapsed',
          'data-phase',
          'data-slot',
          'role',
        ],
        childList: true,
        subtree: true,
      })

      const topTrim = document.createElement('div')
      topTrim.dataset.skinChrome = 'top-trim'
      topTrim.dataset.skinOwner = SKIN_OWNER
      topTrim.setAttribute('aria-hidden', 'true')
      const landingTrimLayer = document.createElement('div')
      landingTrimLayer.dataset.skinTrimLayer = 'landing'
      const workspaceTrimLayer = document.createElement('div')
      workspaceTrimLayer.dataset.skinTrimLayer = 'workspace'
      topTrim.append(landingTrimLayer, workspaceTrimLayer)
      ownedNodes.add(topTrim)
      body.append(topTrim)

      const bottomTrim = document.createElement('div')
      bottomTrim.dataset.skinChrome = 'bottom-trim'
      bottomTrim.dataset.skinOwner = SKIN_OWNER
      bottomTrim.setAttribute('aria-hidden', 'true')
      ownedNodes.add(bottomTrim)
      body.append(bottomTrim)

      const favicon = document.createElement('link')
      favicon.rel = 'icon'
      // v1 declared type="image/png" while the icon was always WebP; the
      // type attribute is simply omitted here (the official favicon
      // convention) so it cannot disagree with the asset again.
      favicon.href = asset('maid-atelier-icon.webp')
      favicon.dataset.skinChrome = 'favicon'
      favicon.dataset.skinOwner = SKIN_OWNER
      ownedNodes.add(favicon)
      document.head.append(favicon)

      document.title = SKIN_TITLE
    },
  }
}
