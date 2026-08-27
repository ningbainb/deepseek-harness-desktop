window.__ModuleLoader__.load({
	id: "@linxin666/dsh-web-ui-all",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0dsh-css:packages/dsh-web-ui-all/src/client/sidebar-rail.module.css.mjs
		const css = "[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>button,[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-taskboard-entry],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-ssh-entry],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-balance-entry],[data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-pane=sidebar] [class*=entryRow][data-rail=rail]{box-sizing:border-box;align-self:center;width:36px;min-width:36px;margin-inline:auto}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-pane=sidebar] [class*=entryRow][data-rail=rail]{flex-direction:column-reverse;justify-content:center;align-items:center;gap:4px;display:flex}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=dockEntry],[data-sidebar-collapsed] [data-pane=sidebar] [class*=dockEntry],[data-pane=sidebar] [class*=dockEntry][data-wide=rail]{justify-content:center;align-self:center;align-items:center;width:36px;min-width:36px;height:36px;margin-inline:auto;display:flex}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[class*=footArea]>[class*=footerActions],[data-sidebar-collapsed] [data-pane=sidebar] [class*=footArea]>[class*=footerActions],[data-pane=sidebar] [class*=footArea]>[class*=footerActions]:has([data-rail=rail]),[data-pane=sidebar] [class*=footArea]>[class*=footerActions]:has([data-wide=rail]){box-sizing:border-box;flex-direction:column;justify-content:center;align-items:center;gap:4px}";
		const tagId = "@linxin666/dsh-web-ui-all/sidebar-rail.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-web-ui-all";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/turn-navigator.ts
		/**
		* Conversation Turn Navigator.
		*
		* Injects a floating navigation widget into the conversation pane that lets
		* users jump instantly to previous / next user messages (turns), and to the
		* bottom of the conversation. The widget self-heals via MutationObserver,
		* re-syncing whenever React re-renders the conversation pane.
		*
		* Selectors used:
		*  - Container: [data-pane="conversation"] (stamped by dsh-web-ui-all shim)
		*  - User messages: [class*="userMessage"], [data-message-role="user"],
		*    [class*="humanTurn"], [class*="turnUser"]
		*/
		/** Stable data attribute for the injected navigator widget. */
		const NAVIGATOR_ATTR = "data-dsh-turn-navigator";
		/** CSS injected once into <head> for the navigator widget. */
		const NAVIGATOR_STYLE = `
[data-dsh-turn-navigator] {
  position: absolute;
  bottom: 80px;
  right: 16px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

[data-dsh-turn-navigator] button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2, rgba(30, 41, 59, 0.92));
  color: var(--dsw-alias-label-secondary, #94a3b8);
  font-size: 14px;
  cursor: pointer;
  pointer-events: all;
  transition: background 120ms ease, color 120ms ease, transform 80ms ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

[data-dsh-turn-navigator] button:hover {
  background: var(--dsw-alias-brand-primary, #3b82f6);
  color: #ffffff;
  transform: scale(1.08);
}

[data-dsh-turn-navigator] button:active {
  transform: scale(0.96);
}

[data-dsh-turn-navigator] button:disabled {
  opacity: 0.35;
  cursor: default;
  transform: none;
}

[data-dsh-turn-navigator] .dsh-turn-counter {
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary, #64748b);
  background: var(--dsw-alias-bg-layer-2, rgba(30,41,59,0.85));
  border-radius: 10px;
  padding: 2px 8px;
  letter-spacing: 0.02em;
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
}
`.trim();
		const USER_MSG_SELECTORS = [
			"[data-message-role=\"user\"]",
			"[class*=\"userMessage\"]",
			"[class*=\"humanTurn\"]",
			"[class*=\"turnUser\"]",
			"[data-role=\"user\"]"
		].join(", ");
		/** Find the conversation scrollable area inside the pane. */
		function findScrollRoot(pane) {
			for (const child of Array.from(pane.querySelectorAll("*"))) {
				const style = getComputedStyle(child);
				if (style.overflowY === "auto" || style.overflowY === "scroll") return child;
			}
			return pane;
		}
		/** Collect all user message elements in DOM order. */
		function getUserMessages(pane) {
			return Array.from(pane.querySelectorAll(USER_MSG_SELECTORS));
		}
		/** Determine the index of the currently-visible turn (first one past viewport center). */
		function currentTurnIndex(scrollRoot, turns) {
			if (turns.length === 0) return -1;
			const viewCenter = scrollRoot.scrollTop + scrollRoot.clientHeight / 2;
			for (let i = turns.length - 1; i >= 0; i--) if ((turns[i]?.offsetTop ?? 0) <= viewCenter) return i;
			return 0;
		}
		/** Smooth-scroll to a turn. */
		function scrollToTurn(scrollRoot, turn) {
			const offsetTop = turn.offsetTop;
			scrollRoot.scrollTo({
				top: Math.max(0, offsetTop - 60),
				behavior: "smooth"
			});
		}
		/** Build and return the navigator widget element. */
		function createNavigator() {
			const nav = document.createElement("div");
			nav.setAttribute(NAVIGATOR_ATTR, "");
			const prevBtn = document.createElement("button");
			prevBtn.type = "button";
			prevBtn.title = "上一条对话 (Previous Turn)";
			prevBtn.setAttribute("aria-label", "跳至上一条对话");
			prevBtn.dataset.role = "prev";
			prevBtn.textContent = "↑";
			const counter = document.createElement("div");
			counter.className = "dsh-turn-counter";
			counter.dataset.role = "counter";
			counter.textContent = "0/0";
			const nextBtn = document.createElement("button");
			nextBtn.type = "button";
			nextBtn.title = "下一条对话 (Next Turn)";
			nextBtn.setAttribute("aria-label", "跳至下一条对话");
			nextBtn.dataset.role = "next";
			nextBtn.textContent = "↓";
			const bottomBtn = document.createElement("button");
			bottomBtn.type = "button";
			bottomBtn.title = "跳至底部 (Jump to Bottom)";
			bottomBtn.setAttribute("aria-label", "跳至底部");
			bottomBtn.dataset.role = "bottom";
			bottomBtn.textContent = "⤓";
			nav.appendChild(prevBtn);
			nav.appendChild(counter);
			nav.appendChild(nextBtn);
			nav.appendChild(bottomBtn);
			return nav;
		}
		/** Update button disabled state and counter text. */
		function syncNavigator(nav, scrollRoot, pane) {
			const turns = getUserMessages(pane);
			const total = turns.length;
			const idx = currentTurnIndex(scrollRoot, turns);
			const prevBtn = nav.querySelector("[data-role=\"prev\"]");
			const nextBtn = nav.querySelector("[data-role=\"next\"]");
			const counter = nav.querySelector("[data-role=\"counter\"]");
			const bottomBtn = nav.querySelector("[data-role=\"bottom\"]");
			if (prevBtn) prevBtn.disabled = idx <= 0 || total === 0;
			if (nextBtn) nextBtn.disabled = idx >= total - 1 || total === 0;
			if (bottomBtn) bottomBtn.disabled = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 40;
			if (counter) counter.textContent = total === 0 ? "–" : `${idx + 1}/${total}`;
		}
		/** Attach click handlers to the navigator buttons. */
		function bindNavigator(nav, scrollRoot, pane) {
			nav.addEventListener("click", (e) => {
				const btn = e.target.closest("button");
				if (!btn) return;
				const role = btn.dataset.role;
				const turns = getUserMessages(pane);
				const idx = currentTurnIndex(scrollRoot, turns);
				if (role === "prev" && idx > 0 && turns[idx - 1]) scrollToTurn(scrollRoot, turns[idx - 1]);
				else if (role === "next" && idx < turns.length - 1 && turns[idx + 1]) scrollToTurn(scrollRoot, turns[idx + 1]);
				else if (role === "bottom") scrollRoot.scrollTo({
					top: scrollRoot.scrollHeight,
					behavior: "smooth"
				});
				setTimeout(() => syncNavigator(nav, scrollRoot, pane), 350);
			});
		}
		/**
		* Mount the conversation turn navigator into the given conversation pane.
		* @returns disposer.
		*/
		function mountTurnNavigator(pane) {
			if (getComputedStyle(pane).position === "static") pane.style.position = "relative";
			const scrollRoot = findScrollRoot(pane);
			const nav = createNavigator();
			pane.appendChild(nav);
			bindNavigator(nav, scrollRoot, pane);
			const onScroll = () => syncNavigator(nav, scrollRoot, pane);
			scrollRoot.addEventListener("scroll", onScroll, { passive: true });
			const mutationObs = new MutationObserver(() => syncNavigator(nav, scrollRoot, pane));
			mutationObs.observe(pane, {
				childList: true,
				subtree: true
			});
			syncNavigator(nav, scrollRoot, pane);
			return () => {
				mutationObs.disconnect();
				scrollRoot.removeEventListener("scroll", onScroll);
				nav.remove();
				if (pane.style.position === "relative") pane.style.position = "";
			};
		}
		/** Install styles once into <head>. */
		function ensureStyle() {
			if (document.getElementById("dsh-turn-navigator-style")) return;
			const style = document.createElement("style");
			style.id = "dsh-turn-navigator-style";
			style.textContent = NAVIGATOR_STYLE;
			document.head.appendChild(style);
		}
		/**
		* Bootstrap the turn navigator for the whole page lifetime.
		* Watches for the conversation pane to mount / re-mount and re-injects the widget.
		* @returns disposer.
		*/
		function installTurnNavigator() {
			ensureStyle();
			let disposeNavigator;
			let currentPane;
			const PANE_SELECTOR = "[data-pane=\"conversation\"]";
			const tryMount = () => {
				const pane = document.querySelector(PANE_SELECTOR);
				if (pane === currentPane) return;
				disposeNavigator?.();
				disposeNavigator = void 0;
				currentPane = void 0;
				if (!pane) return;
				currentPane = pane;
				disposeNavigator = mountTurnNavigator(pane);
			};
			const observer = new MutationObserver(tryMount);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			tryMount();
			return () => {
				observer.disconnect();
				disposeNavigator?.();
				document.getElementById("dsh-turn-navigator-style")?.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Column shims: element selector → attribute to stamp. */
		const COLUMN_SHIMS = [
			["[class*=\"sidebarCol\"]", "data-pane=\"sidebar\""],
			["[class*=\"centerCol\"]", "data-pane=\"conversation\""],
			["[class*=\"detailsCol\"]", "data-pane=\"details\""]
		];
		/** One pass over the current DOM. Returns false once every stamp is already in place. */
		function applyShims() {
			let changed = false;
			for (const [selector, attribute] of COLUMN_SHIMS) {
				const el = document.querySelector(selector);
				const eq = attribute.indexOf("=");
				const name = attribute.slice(0, eq);
				const value = attribute.slice(eq + 1).replace(/^"|"$/g, "");
				if (el !== null && el.getAttribute(name) !== value) {
					el.setAttribute(name, value);
					changed = true;
				}
			}
			const sidebarEl = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			const frame = sidebarEl?.parentElement ?? null;
			if (frame !== null && frame.getAttribute("data-dsh-frame") !== "") {
				frame.setAttribute("data-dsh-frame", "");
				changed = true;
			}
			const isCollapsed = sidebarEl !== null && (sidebarEl.offsetWidth > 0 && sidebarEl.offsetWidth <= 80 || sidebarEl.classList.contains("hHd-Xa_collapsed") || sidebarEl.className.includes("collapsed") || sidebarEl.querySelector("[class*=\"collapsed\"]") !== null || sidebarEl.querySelector("[data-rail=\"rail\"], [data-wide=\"rail\"]") !== null);
			if (frame !== null) {
				if (isCollapsed && !frame.hasAttribute("data-sidebar-collapsed")) {
					frame.setAttribute("data-sidebar-collapsed", "");
					changed = true;
				} else if (!isCollapsed && frame.hasAttribute("data-sidebar-collapsed")) {
					frame.removeAttribute("data-sidebar-collapsed");
					changed = true;
				}
			}
			if (sidebarEl !== null) {
				if (isCollapsed && !sidebarEl.hasAttribute("data-sidebar-collapsed")) {
					sidebarEl.setAttribute("data-sidebar-collapsed", "");
					changed = true;
				} else if (!isCollapsed && sidebarEl.hasAttribute("data-sidebar-collapsed")) {
					sidebarEl.removeAttribute("data-sidebar-collapsed");
					changed = true;
				}
			}
			if (isCollapsed && !document.body.hasAttribute("data-sidebar-collapsed")) {
				document.body.setAttribute("data-sidebar-collapsed", "");
				changed = true;
			} else if (!isCollapsed && document.body.hasAttribute("data-sidebar-collapsed")) {
				document.body.removeAttribute("data-sidebar-collapsed");
				changed = true;
			}
			return changed;
		}
		/**
		* Coalesce mutation bursts into one pass per frame. React renders burst
		* dozens of subtree mutations per commit; stamping on every single mutation
		* callback turned each render into many querySelector sweeps. A scheduled
		* rAF plus a done flag folds the whole burst into a single pass, and the
		* idempotence check stops the work entirely once every attribute is set.
		*/
		function schedulePass() {
			if (shimScheduled) return;
			shimScheduled = true;
			requestAnimationFrame(() => {
				shimScheduled = false;
				applyShims();
			});
		}
		/** True while a coalesced pass is pending. */
		let shimScheduled = false;
		/** Required services: none — the shim must run before any DOM mount waits. */
		const inject = [];
		/**
		* Register the shim for the page lifetime.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				applyShims();
				const observer = new MutationObserver(schedulePass);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: [
						"class",
						"style",
						"data-wide",
						"data-rail"
					]
				});
				let resizeObserver;
				if (typeof ResizeObserver !== "undefined") {
					resizeObserver = new ResizeObserver(schedulePass);
					const sidebar = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
					if (sidebar) resizeObserver.observe(sidebar);
				}
				return () => {
					observer.disconnect();
					resizeObserver?.disconnect();
					shimScheduled = false;
				};
			});
			ctx.effect(() => installTurnNavigator(), "dsh-web-ui-all: turn navigator");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map