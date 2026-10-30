export const CLEARANCE_REFRESH = 'dsh-dafeiyu-clearance-refresh';
/** Display coordinates only. Vendor anchors and persistence remain vendor-owned. */
export function projectDafeiyuPosition(position, viewport, obstacles) {
    const gap = 12, minLeft = viewport.left + gap, minTop = Math.max(position.minTop, viewport.top + gap);
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - position.width - gap);
    const maxTop = Math.max(minTop, viewport.top + viewport.height - position.height - gap);
    const origin = { left: Math.max(minLeft, Math.min(maxLeft, position.left)), top: Math.max(minTop, Math.min(maxTop, position.top)) };
    const fits = (left, top) => left >= minLeft && left <= maxLeft && top >= minTop && top <= maxTop
        && obstacles.every(rect => left + position.width <= rect.left - gap || left >= rect.left + rect.width + gap
            || top + position.height <= rect.top - gap || top >= rect.top + rect.height + gap);
    if (fits(origin.left, origin.top))
        return origin;
    // Keep the full companion above input controls when that space is available.
    const above = obstacles.map(rect => rect.top - position.height - gap).filter(top => top < origin.top).sort((a, b) => b - a);
    for (const top of above)
        if (fits(origin.left, top))
            return { left: origin.left, top };
    const xs = new Set([origin.left, minLeft, maxLeft]), ys = new Set([origin.top, minTop, maxTop]);
    for (const rect of obstacles) {
        xs.add(rect.left - position.width - gap);
        xs.add(rect.left + rect.width + gap);
        ys.add(rect.top - position.height - gap);
        ys.add(rect.top + rect.height + gap);
    }
    let best;
    for (const left of xs)
        for (const top of ys) {
            if (!fits(left, top))
                continue;
            const distance = (left - position.left) ** 2 + (top - position.top) ** 2;
            if (!best || distance < best.distance)
                best = { left, top, distance };
        }
    return best ? { left: best.left, top: best.top } : origin;
}
const OBSTACLE = '[data-composer-card], [data-pane="conversation"] nav[aria-label], '
    + '[data-pane="conversation"] button[aria-label="回到底部"], '
    + '[data-pane="conversation"] button[aria-label="Back to bottom"], '
    + '[data-pane="conversation"] button[aria-label="Scroll to bottom"]';
const WIDGET = '.dfy-root';
/** One disposable observer lease. The vendor's render path reads cached geometry. */
export function installDafeiyuClearance(host, document) {
    const previous = Object.getOwnPropertyDescriptor(host, '__dshDafeiyuProjectPosition');
    let disposed = false, frame, membership = true, signature = '';
    let composers = [], widget = null, obstacles = [];
    let viewport = { left: 0, top: 0, width: host.innerWidth, height: host.innerHeight };
    const project = position => projectDafeiyuPosition(position, viewport, obstacles);
    host.__dshDafeiyuProjectPosition = project;
    const refresh = () => host.dispatchEvent(new host.Event(CLEARANCE_REFRESH));
    const resize = typeof host.ResizeObserver === 'undefined' ? undefined : new host.ResizeObserver(() => schedule());
    const measure = () => {
        frame = undefined;
        if (disposed)
            return;
        if (membership) {
            membership = false;
            composers = [...document.querySelectorAll(OBSTACLE)];
            widget = document.querySelector(WIDGET);
            resize?.disconnect();
            for (const element of composers)
                resize?.observe(element);
            if (widget)
                resize?.observe(widget);
        }
        const visual = host.visualViewport;
        viewport = visual ? { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width, height: visual.height }
            : { left: 0, top: 0, width: host.innerWidth, height: host.innerHeight };
        obstacles = composers.filter(element => {
            const style = host.getComputedStyle(element);
            return element.isConnected && !element.closest('[hidden], [aria-hidden="true"]') && style.display !== 'none'
                && style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
        }).map(element => element.getBoundingClientRect())
            .filter(rect => rect.width > 0 && rect.height > 0 && rect.right > viewport.left && rect.bottom > viewport.top
            && rect.left < viewport.left + viewport.width && rect.top < viewport.top + viewport.height)
            .map(({ left, top, width, height }) => ({ left, top, width, height }));
        const bounds = widget?.getBoundingClientRect();
        const next = JSON.stringify({ viewport, obstacles, width: bounds?.width, height: bounds?.height });
        if (next !== signature) {
            signature = next;
            refresh();
        }
    };
    function schedule(refreshMembership = false) {
        membership ||= refreshMembership;
        if (!disposed && frame === undefined)
            frame = host.requestAnimationFrame(measure);
    }
    const mutation = new host.MutationObserver(records => {
        let membersChanged = false, relevant = false;
        for (const record of records) {
            if (widget?.contains(record.target))
                continue;
            const target = record.target instanceof host.Element ? record.target : record.target.parentElement;
            if (!target)
                continue;
            if (record.type === 'attributes') {
                membersChanged ||= record.attributeName === 'data-composer-card' || record.attributeName === 'aria-label';
                relevant ||= composers.some(element => element.contains(target) || target.contains(element));
            }
            else {
                // History can move a same-size composer without resizing the card itself.
                relevant ||= composers.some(element => (element.closest('[data-pane="conversation"]') ?? element.parentElement)?.contains(target));
                for (const node of [...record.addedNodes, ...record.removedNodes]) {
                    if (node instanceof host.Element && (node.matches(`${OBSTACLE}, ${WIDGET}`) || node.querySelector(`${OBSTACLE}, ${WIDGET}`)))
                        membersChanged = true;
                }
            }
        }
        if (membersChanged || relevant)
            schedule(membersChanged);
    });
    mutation.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-composer-card', 'aria-label'] });
    const changed = () => schedule();
    host.addEventListener('resize', changed);
    host.visualViewport?.addEventListener('resize', changed);
    host.visualViewport?.addEventListener('scroll', changed);
    document.addEventListener('scroll', changed, true);
    schedule();
    return () => {
        if (disposed)
            return;
        disposed = true;
        if (frame !== undefined)
            host.cancelAnimationFrame(frame);
        mutation.disconnect();
        resize?.disconnect();
        host.removeEventListener('resize', changed);
        host.visualViewport?.removeEventListener('resize', changed);
        host.visualViewport?.removeEventListener('scroll', changed);
        document.removeEventListener('scroll', changed, true);
        if (host.__dshDafeiyuProjectPosition === project) {
            if (previous)
                Object.defineProperty(host, '__dshDafeiyuProjectPosition', previous);
            else
                delete host.__dshDafeiyuProjectPosition;
            refresh();
        }
    };
}
