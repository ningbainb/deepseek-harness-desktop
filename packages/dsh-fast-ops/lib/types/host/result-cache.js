import { randomUUID } from 'node:crypto';
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_ROW_BYTES = 480;
export class ResultCache {
    entries = new Map();
    totalBytes = 0;
    getMaxRefs;
    now;
    constructor(options = {}) {
        this.getMaxRefs = options.getMaxRefs ?? (() => 128);
        this.now = options.now ?? (() => Date.now());
    }
    isExpired(entry, now) {
        return entry.ref.ttlMs > 0 && now - entry.ref.createdAt > entry.ref.ttlMs;
    }
    deleteEntry(id) {
        const entry = this.entries.get(id);
        if (!entry)
            return false;
        this.entries.delete(id);
        this.totalBytes = Math.max(0, this.totalBytes - entry.ref.totalBytes);
        return true;
    }
    prune(now) {
        for (const [id, entry] of this.entries) {
            if (this.isExpired(entry, now))
                this.deleteEntry(id);
        }
        const maxRefs = Math.max(1, this.getMaxRefs());
        if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES)
            return;
        const byAccess = Array.from(this.entries.entries()).sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
        for (const [id] of byAccess) {
            if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES)
                break;
            this.deleteEntry(id);
        }
    }
    put(params) {
        const now = this.now();
        const totalBytes = Buffer.byteLength(JSON.stringify(params.items), 'utf8');
        const id = randomUUID();
        const refId = `ref://${encodeURIComponent(params.sessionId)}/${encodeURIComponent(params.producerTool)}/${id}`;
        const ref = {
            refId,
            createdAt: now,
            ttlMs: Math.max(0, params.ttlMs),
            producerTool: params.producerTool,
            totalItems: params.items.length,
            totalBytes,
            preview: params.preview ?? `${params.producerTool}: ${params.items.length} items (${totalBytes} bytes)`,
        };
        this.entries.set(refId, {
            ref,
            sessionId: params.sessionId,
            principalId: params.principalId,
            items: params.items,
            lastAccessedAt: now,
        });
        this.totalBytes += totalBytes;
        this.prune(now);
        return ref;
    }
    /** Preserve exact content while keeping every row within the smallest supported page. */
    putText(params) {
        if (Buffer.byteLength(params.text, 'utf8') > MAX_TOTAL_BYTES)
            return undefined;
        const items = [];
        const rowOverhead = Buffer.byteLength('{"text":""}', 'utf8');
        let accounted = 2;
        let rowStart = 0;
        let rowBytes = rowOverhead;
        const append = (end) => {
            accounted += rowBytes + (items.length ? 1 : 0);
            if (accounted > MAX_TOTAL_BYTES)
                return false;
            items.push({ text: params.text.slice(rowStart, end) });
            rowStart = end;
            rowBytes = rowOverhead;
            return true;
        };
        for (let i = 0; i < params.text.length;) {
            const codePoint = params.text.codePointAt(i);
            const width = codePoint > 0xffff ? 2 : 1;
            const bytes = jsonCodePointBytes(codePoint);
            if (rowBytes + bytes > MAX_TEXT_ROW_BYTES && !append(i))
                return undefined;
            rowBytes += bytes;
            i += width;
        }
        if (!append(params.text.length))
            return undefined;
        const ref = this.put({ ...params, items });
        return this.entries.has(ref.refId) ? ref : undefined;
    }
    page(params) {
        const now = this.now();
        this.prune(now);
        const entry = this.entries.get(params.refId);
        if (!entry || entry.sessionId !== params.sessionId || entry.principalId !== params.principalId) {
            return { ok: false, refId: params.refId, error: 'reference-not-found' };
        }
        entry.lastAccessedAt = now;
        let filtered = entry.items;
        if (params.equals && typeof params.equals === 'object') {
            const filters = Object.entries(params.equals).slice(0, 16);
            if (filters.length > 0) {
                filtered = filtered.filter(row => filters.every(([k, v]) => row[k] === v));
            }
        }
        const offset = Math.max(0, Math.floor(params.offset ?? 0));
        const limit = Math.max(1, Math.min(512, Math.floor(params.limit ?? 64)));
        const maxBytes = Math.max(512, Math.min(65536, Math.floor(params.maxBytes ?? 16384)));
        const fields = Array.isArray(params.fields) && params.fields.length > 0
            ? params.fields.slice(0, 32).filter((f) => typeof f === 'string' && f.length <= 128)
            : null;
        const pageItems = [];
        let bytesUsed = 2;
        let index = offset;
        while (index < filtered.length && pageItems.length < limit) {
            const sourceRow = filtered[index];
            const projected = fields
                ? Object.fromEntries(fields.filter(k => Object.hasOwn(sourceRow, k)).map(k => [k, sourceRow[k]]))
                : sourceRow;
            const itemBytes = Buffer.byteLength(JSON.stringify(projected), 'utf8') + (pageItems.length > 0 ? 1 : 0);
            if (bytesUsed + itemBytes > maxBytes) {
                if (pageItems.length === 0) {
                    return { ok: false, refId: params.refId, error: 'row-exceeds-max-bytes' };
                }
                break;
            }
            pageItems.push(projected);
            bytesUsed += itemBytes;
            index++;
        }
        const complete = index >= filtered.length;
        return {
            ok: true,
            refId: params.refId,
            items: pageItems,
            totalFiltered: filtered.length,
            offset,
            nextOffset: complete ? null : index,
            complete,
        };
    }
    release(sessionId, refId, principalId) {
        const entry = this.entries.get(refId);
        if (!entry || entry.sessionId !== sessionId || entry.principalId !== principalId)
            return false;
        return this.deleteEntry(refId);
    }
    clearSession(sessionId) {
        let removed = 0;
        for (const [id, entry] of this.entries) {
            if (entry.sessionId === sessionId && this.deleteEntry(id))
                removed++;
        }
        return removed;
    }
    reclaimAll() {
        const count = this.entries.size;
        this.entries.clear();
        this.totalBytes = 0;
        return count;
    }
    stats() {
        this.prune(this.now());
        let totalItems = 0;
        for (const entry of this.entries.values())
            totalItems += entry.items.length;
        return { totalRefs: this.entries.size, totalBytes: this.totalBytes, totalItems };
    }
}
function jsonCodePointBytes(value) {
    if (value === 34 || value === 92 || value === 8 || value === 9 || value === 10 || value === 12 || value === 13)
        return 2;
    if (value < 32 || (value >= 0xd800 && value <= 0xdfff))
        return 6;
    if (value < 0x80)
        return 1;
    if (value < 0x800)
        return 2;
    return value <= 0xffff ? 3 : 4;
}
