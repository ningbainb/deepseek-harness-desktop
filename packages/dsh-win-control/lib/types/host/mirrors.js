export const MIRROR_CANDIDATES = Object.freeze([
    { id: 'ustc', label: 'USTC 中科大', indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', official: false },
    { id: 'aliyun', label: '阿里云', indexUrl: 'https://mirrors.aliyun.com/pypi/simple', official: false },
    { id: 'tencent', label: '腾讯云', indexUrl: 'https://mirrors.cloud.tencent.com/pypi/simple', official: false },
    { id: 'huawei', label: '华为云', indexUrl: 'https://repo.huaweicloud.com/repository/pypi/simple', official: false },
    { id: 'nju', label: '南京大学', indexUrl: 'https://mirrors.nju.edu.cn/pypi/web/simple', official: false },
    { id: 'tuna', label: '清华 TUNA', indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', official: false },
    { id: 'pypi', label: 'PyPI 官方', indexUrl: 'https://pypi.org/simple', official: true },
]);
export function projectIndexUrl(indexUrl, project = 'windows-mcp') {
    const base = indexUrl.replace(/\/+$/u, '');
    return `${base}/${encodeURIComponent(project)}/`;
}
function decodeHtmlAttr(value) {
    return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
}
/** Parse PEP 503 Simple API links for wheels or source archives. */
export function parseSimpleIndex(html, baseUrl) {
    if (typeof html !== 'string' || html === '')
        return [];
    const entries = [];
    const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/giu;
    for (const match of html.matchAll(pattern)) {
        const rawHref = decodeHtmlAttr(match[1]).split('#')[0];
        const filename = match[2].trim();
        const whlMatch = /^(?:windows[_-]mcp)-([0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?)-[^/]+\.whl$/iu.exec(filename);
        const tarMatch = /^(?:windows[_-]mcp)-([0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?)\.(?:tar\.gz|zip)$/iu.exec(filename);
        const version = whlMatch?.[1] ?? tarMatch?.[1];
        if (!version)
            continue;
        try {
            const resolved = new URL(rawHref, baseUrl).href;
            entries.push({ filename, version, url: resolved });
        }
        catch {
            continue;
        }
    }
    return entries;
}
function compareVersionsDesc(left, right) {
    const split = (v) => v.split(/[.+-]/u).map(p => (/^\d+$/u.test(p) ? Number(p) : p));
    const a = split(left);
    const b = split(right);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x === y)
            continue;
        if (typeof x === 'number' && typeof y === 'number')
            return y - x;
        return String(y).localeCompare(String(x));
    }
    return 0;
}
export function pickWheelEntry(entries, version) {
    if (entries.length === 0)
        return null;
    const wheels = entries.filter(e => e.filename.toLowerCase().endsWith('.whl'));
    const pool = wheels.length > 0 ? wheels : entries;
    if (typeof version === 'string' && version.trim() !== '') {
        const wanted = version.trim();
        return pool.find(e => e.version === wanted) ?? entries.find(e => e.version === wanted) ?? null;
    }
    const stable = pool.filter(e => /^\d+(?:\.\d+)+$/u.test(e.version));
    const candidates = (stable.length > 0 ? stable : pool).slice().sort((l, r) => compareVersionsDesc(l.version, r.version));
    return candidates[0] ?? null;
}
async function probeOne(mirror, fetchImpl, timeoutMs, sampleBytes, version) {
    const base = { id: mirror.id, label: mirror.label, indexUrl: mirror.indexUrl, official: mirror.official };
    const startedAt = Date.now();
    try {
        const pageUrl = projectIndexUrl(mirror.indexUrl, 'windows-mcp');
        const page = await fetchImpl(pageUrl, {
            headers: { accept: 'text/html', 'user-agent': 'dsh-win-control-probe' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const indexMs = Math.max(1, Date.now() - startedAt);
        if (!page?.ok)
            throw new Error(`HTTP ${page?.status ?? '?'}`);
        const html = await page.text();
        const entries = parseSimpleIndex(html, pageUrl);
        if (entries.length === 0)
            throw new Error('索引为空');
        const target = pickWheelEntry(entries, version);
        if (!target)
            throw new Error(version ? `缺少版本 ${version}` : '未找到可用包');
        const dlStart = Date.now();
        const sample = await fetchImpl(target.url, {
            headers: { range: `bytes=0-${Math.max(0, sampleBytes - 1)}`, 'user-agent': 'dsh-win-control-probe' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (sample.status !== 200 && sample.status !== 206)
            throw new Error(`下载探测 HTTP ${sample.status}`);
        const buf = new Uint8Array(await sample.arrayBuffer());
        const downloadMs = Math.max(1, Date.now() - dlStart);
        const speedBps = buf.byteLength === 0 ? 0 : Math.round(buf.byteLength / (downloadMs / 1000));
        return {
            ...base,
            ok: true,
            indexMs,
            downloadMs,
            bytes: buf.byteLength,
            speedBps,
            version: target.version,
        };
    }
    catch (error) {
        return {
            ...base,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/** Rank mirrors by throughput descending then index latency ascending, keeping official fallback last. */
export async function probeMirrors(options = {}) {
    const candidates = options.candidates ?? MIRROR_CANDIDATES;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs : 8000;
    const sampleBytes = Number.isFinite(options.sampleBytes) && (options.sampleBytes ?? 0) > 0 ? options.sampleBytes : 96 * 1024;
    const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
    const version = options.version ?? null;
    const results = new Array(candidates.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < candidates.length) {
            const idx = nextIndex++;
            results[idx] = await probeOne(candidates[idx], fetchImpl, timeoutMs, sampleBytes, version);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
    return results.sort((left, right) => {
        if (left.official !== right.official)
            return left.official ? 1 : -1;
        if (left.ok !== right.ok)
            return left.ok ? -1 : 1;
        const speedDiff = (right.speedBps ?? 0) - (left.speedBps ?? 0);
        if (speedDiff !== 0)
            return speedDiff;
        return (left.indexMs ?? Number.MAX_SAFE_INTEGER) - (right.indexMs ?? Number.MAX_SAFE_INTEGER);
    });
}
