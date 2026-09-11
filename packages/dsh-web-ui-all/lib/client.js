window.__ModuleLoader__.load({id:`@linxin666/dsh-web-ui-all`,factory:e=>{var t={exports:{}},n=t.exports;Object.defineProperty(n,Symbol.toStringTag,{value:`Module`});let r=`@linxin666/dsh-web-ui-all/sidebar-rail.module.css`;if(typeof document<`u`&&document.querySelector(`style[data-plugin-css=`+JSON.stringify(r)+`]`)===null){let e=document.createElement(`style`);e.dataset.plugin=`@linxin666/dsh-web-ui-all`,e.dataset.pluginCss=r,e.textContent=`[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>button,[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-taskboard-entry],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-ssh-entry],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[data-dsh-balance-entry],[data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-pane=sidebar] [class*=entryRow][data-rail=rail]{box-sizing:border-box;align-self:center;width:36px;min-width:36px;margin-inline:auto}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-sidebar-collapsed] [data-pane=sidebar] [class*=entryRow],[data-pane=sidebar] [class*=entryRow][data-rail=rail]{flex-direction:column-reverse;justify-content:center;align-items:center;gap:4px;display:flex}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar] [class*=dockEntry],[data-sidebar-collapsed] [data-pane=sidebar] [class*=dockEntry],[data-pane=sidebar] [class*=dockEntry][data-wide=rail]{justify-content:center;align-self:center;align-items:center;width:36px;min-width:36px;height:36px;margin-inline:auto;display:flex}[data-dsh-frame][data-sidebar-collapsed] [data-pane=sidebar]>div>[class*=footArea]>[class*=footerActions],[data-sidebar-collapsed] [data-pane=sidebar] [class*=footArea]>[class*=footerActions]{box-sizing:border-box;flex-direction:column;justify-content:center;align-items:center;gap:4px}`,document.head.appendChild(e)}let i=`data-dsh-turn-navigator`,a=[`[data-chat-flow-kind="user"]`,`[data-message-role="user"]`,`[class*="userMessage"]`,`[class*="humanTurn"]`,`[class*="turnUser"]`,`[data-role="user"]`].join(`, `);function getUserMessages(e){return Array.from(e.querySelectorAll(a)).filter(t=>{let n=t.parentElement?.closest(a);return!n||n===e||!e.contains(n)})}function findScrollRoot(e,t=getUserMessages(e)){let n=e.matches(`[data-conversation-scroll]`)?e:e.querySelector(`[data-conversation-scroll]`);if(n!==null)return n;let r=[e,...Array.from(e.querySelectorAll(`*`))].filter(e=>{let t=getComputedStyle(e);return t.overflowY===`auto`||t.overflowY===`scroll`}),i=t.length===0?r:r.filter(e=>t.every(t=>e.contains(t))),a=i.filter(e=>e.scrollHeight>e.clientHeight+1),o=a.length>0?a:i;for(let e of o)if(!o.some(t=>t!==e&&e.contains(t)))return e;return e}function viewportTop(e){return e.getBoundingClientRect().top+e.clientTop}function currentTurnIndex(e,t){if(t.length===0)return-1;let n=viewportTop(e)+Math.min(80,e.clientHeight/4);for(let e=t.length-1;e>=0;e--)if((t[e]?.getBoundingClientRect().top??1/0)<=n)return e;return 0}function scrollToTurn(e,t){let n=e.scrollTop+t.getBoundingClientRect().top-viewportTop(e);e.scrollTo({top:Math.max(0,n-60),behavior:`smooth`})}function createNavigator(){let e=document.createElement(`div`);e.setAttribute(i,``);let t=document.createElement(`button`);t.type=`button`,t.title=`上一条对话 (Previous Turn)`,t.setAttribute(`aria-label`,`跳至上一条对话`),t.dataset.role=`prev`,t.textContent=`↑`;let n=document.createElement(`div`);n.className=`dsh-turn-counter`,n.dataset.role=`counter`,n.textContent=`0/0`;let r=document.createElement(`button`);r.type=`button`,r.title=`下一条对话 (Next Turn)`,r.setAttribute(`aria-label`,`跳至下一条对话`),r.dataset.role=`next`,r.textContent=`↓`;let a=document.createElement(`button`);return a.type=`button`,a.title=`跳至底部 (Jump to Bottom)`,a.setAttribute(`aria-label`,`跳至底部`),a.dataset.role=`bottom`,a.textContent=`⤓`,e.appendChild(t),e.appendChild(n),e.appendChild(r),e.appendChild(a),e}function syncNavigator(e,t,n){positionNavigator(e,t,n);let r=getUserMessages(n),i=r.length,a=t.scrollTop+t.clientHeight>=t.scrollHeight-40,o=i>0&&a?i-1:currentTurnIndex(t,r),s=e.querySelector(`[data-role="prev"]`),c=e.querySelector(`[data-role="next"]`),l=e.querySelector(`[data-role="counter"]`),u=e.querySelector(`[data-role="bottom"]`);if(s&&(s.disabled=o<=0||i===0),c&&(c.disabled=o>=i-1||i===0),u){u.disabled=a;let e=a||hasNativeBottomAction(n);u.hidden!==e&&(u.hidden=e)}let d=i===0?`–`:String(o+1)+`/`+String(i);l&&l.textContent!==d&&(l.textContent=d)}function positionNavigator(e,t,n){let r=n.getBoundingClientRect();if(r.height<=0)return;let i=(n.querySelector(`[data-composer-seat]`)??document.querySelector(`[data-composer-seat]`))?.getBoundingClientRect().top??r.bottom,a=Math.min(r.bottom,t.getBoundingClientRect().bottom,i),o=Math.max(12,Math.round(r.bottom-a+12))+`px`;e.style.bottom!==o&&(e.style.bottom=o)}function bindNavigator(e,t,n){let r,onClick=i=>{let a=i.target.closest(`button`);if(!a)return;let o=a.dataset.role,s=t(),c=getUserMessages(n),l=currentTurnIndex(s,c);o===`prev`&&l>0&&c[l-1]?scrollToTurn(s,c[l-1]):o===`next`&&l<c.length-1&&c[l+1]?scrollToTurn(s,c[l+1]):o===`bottom`&&s.scrollTo({top:s.scrollHeight,behavior:`smooth`}),clearTimeout(r),r=setTimeout(()=>syncNavigator(e,t(),n),350)};return e.addEventListener(`click`,onClick),()=>{clearTimeout(r),e.removeEventListener(`click`,onClick)}}function mountTurnNavigator(e){let t=e.style.position,n=getComputedStyle(e).position===`static`;n&&(e.style.position=`relative`);let r=createNavigator();e.appendChild(r);let i=findScrollRoot(e),onScroll=()=>syncNavigator(r,i,e),refresh=()=>{let t=findScrollRoot(e);t!==i&&(i.removeEventListener(`scroll`,onScroll),i=t,i.addEventListener(`scroll`,onScroll,{passive:!0})),syncNavigator(r,i,e)},a=bindNavigator(r,()=>i,e);i.addEventListener(`scroll`,onScroll,{passive:!0});let o=new MutationObserver(e=>{e.some(e=>!r.contains(e.target))&&refresh()});o.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`class`,`style`,`hidden`,`aria-hidden`,`aria-label`,`disabled`,`inert`]});let s=typeof ResizeObserver>`u`?void 0:new ResizeObserver(refresh);s?.observe(e);let c=document.querySelector(`[data-composer-seat]`);return c&&s?.observe(c),window.addEventListener(`resize`,refresh),syncNavigator(r,i,e),()=>{o.disconnect(),s?.disconnect(),window.removeEventListener(`resize`,refresh),i.removeEventListener(`scroll`,onScroll),a(),r.remove(),n&&e.style.position===`relative`&&(e.style.position=t)}}function ensureStyle(){if(document.getElementById(`dsh-turn-navigator-style`))return;let e=document.createElement(`style`);e.id=`dsh-turn-navigator-style`,e.textContent=`[data-dsh-turn-navigator] {
  position: absolute;
  bottom: 12px;
  left: 16px;
  z-index: 200;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2, #64748b);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #1e293b);
  pointer-events: none;
}

[data-dsh-turn-navigator] button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, rgba(30, 41, 59, 0.92));
  color: var(--dsw-alias-label-secondary, #94a3b8);
  font-size: 14px;
  cursor: pointer;
  pointer-events: all;
  transition: background 120ms ease, color 120ms ease, transform 80ms ease;
  box-shadow: none;
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

[data-dsh-turn-navigator] button[hidden] {
  display: none;
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
  box-shadow: none;
}`,document.head.appendChild(e)}function isVisibleControl(e,t){if(!e.isConnected||e.closest(`[hidden], [aria-hidden="true"], [inert]`))return!1;for(let n=e;n;n=n.parentElement){let e=getComputedStyle(n);if(e.display===`none`||e.visibility===`hidden`||e.visibility===`collapse`||e.opacity===`0`)return!1;if(n===t)break}return!0}function hasNativeBottomAction(e){return Array.from(e.querySelectorAll(`button[aria-label="回到底部"], button[aria-label="Back to bottom"]`)).some(t=>!t.disabled&&!t.closest(`[data-chat-flow], [data-dsh-turn-navigator]`)&&isVisibleControl(t,e))}function hasNativeTurnNavigator(e){return Array.from(e.querySelectorAll(`nav[aria-label="轮次导航"], nav[aria-label="Turn navigation"]`)).some(t=>t.querySelectorAll(`button`).length<2?!1:isVisibleControl(t,e))}function installTurnNavigator(){ensureStyle();let e,t,n=!1,tryMount=()=>{let r=document.querySelector(`[data-pane="conversation"]`),o=r!==null&&hasNativeTurnNavigator(r),s=r&&!o?getUserMessages(r):[],c=r&&!o&&s.length===0?findScrollRoot(r,s):null,l=r!==null&&!o&&(s.length>0||c!==null&&c.scrollHeight>c.clientHeight+40);r===t&&l===n&&(!l||r?.querySelector(`[${i}]`))||(r!==t&&(a?.disconnect(),r&&a?.observe(r)),e?.(),e=void 0,t=void 0,n=l,r&&(t=r,l&&(e=mountTurnNavigator(r))))},r=new MutationObserver(tryMount),a=typeof ResizeObserver>`u`?void 0:new ResizeObserver(tryMount);return r.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`aria-label`,`aria-hidden`,`hidden`]}),window.addEventListener(`resize`,tryMount),tryMount(),()=>{r.disconnect(),a?.disconnect(),window.removeEventListener(`resize`,tryMount),e?.(),document.getElementById(`dsh-turn-navigator-style`)?.remove()}}let o=[[`[class*="sidebarCol"]`,`data-pane="sidebar"`],[`[class*="centerCol"]`,`data-pane="conversation"`],[`[class*="detailsCol"]`,`data-pane="details"`]];function resetExpandedFooterActionStyles(e,t){if(t)return!1;let n=!1;for(let t of e.querySelectorAll(`[data-slot="sidebar.footer.action"]`))t.style.getPropertyValue(`margin-inline`)===`auto`&&(t.style.removeProperty(`margin-inline`),n=!0),t.style.getPropertyValue(`justify-content`)===`center`&&(t.style.removeProperty(`justify-content`),n=!0);return n}function applyShims(){let e=!1;for(let[t,n]of o){let r=document.querySelector(t),i=n.indexOf(`=`),a=n.slice(0,i),o=n.slice(i+1).replace(/^"|"$/g,``);r!==null&&r.getAttribute(a)!==o&&(r.setAttribute(a,o),e=!0)}let t=document.querySelector(`[data-pane="sidebar"], [class*="sidebarCol"]`),n=t?.parentElement??null;n!==null&&n.getAttribute(`data-dsh-frame`)!==``&&(n.setAttribute(`data-dsh-frame`,``),e=!0);let r=typeof t?.className==`string`?t.className:``,i=t!==null&&(t.offsetWidth>0&&t.offsetWidth<=80||t.classList.contains(`hHd-Xa_collapsed`)||/(?:^|\s)collapsed(?:\s|$)/u.test(r));return t!==null&&(e=resetExpandedFooterActionStyles(t,i)||e),n!==null&&(i&&!n.hasAttribute(`data-sidebar-collapsed`)?(n.setAttribute(`data-sidebar-collapsed`,``),e=!0):!i&&n.hasAttribute(`data-sidebar-collapsed`)&&(n.removeAttribute(`data-sidebar-collapsed`),e=!0)),t!==null&&(i&&!t.hasAttribute(`data-sidebar-collapsed`)?(t.setAttribute(`data-sidebar-collapsed`,``),e=!0):!i&&t.hasAttribute(`data-sidebar-collapsed`)&&(t.removeAttribute(`data-sidebar-collapsed`),e=!0)),i&&!document.body.hasAttribute(`data-sidebar-collapsed`)?(document.body.setAttribute(`data-sidebar-collapsed`,``),e=!0):!i&&document.body.hasAttribute(`data-sidebar-collapsed`)&&(document.body.removeAttribute(`data-sidebar-collapsed`),e=!0),e}function schedulePass(){s||(s=!0,requestAnimationFrame(()=>{s=!1,applyShims()}))}let s=!1,c=[];function apply(e){e.effect(()=>{applyShims();let e=new MutationObserver(schedulePass);e.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`class`,`style`,`data-wide`,`data-rail`]});let t;if(typeof ResizeObserver<`u`){t=new ResizeObserver(schedulePass);let e=document.querySelector(`[data-pane="sidebar"], [class*="sidebarCol"]`);e&&t.observe(e)}return()=>{e.disconnect(),t?.disconnect(),s=!1}}),e.effect(()=>installTurnNavigator(),`dsh-web-ui-all: turn navigator`)}return n.apply=apply,n.inject=c,t.exports}});
//# sourceMappingURL=client.js.map