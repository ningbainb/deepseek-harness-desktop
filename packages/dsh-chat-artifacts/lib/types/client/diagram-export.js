const MAX_SVG_CHARS = 512 * 1024;
const MAX_MERMAID_CHARS = 32 * 1024;
const SVG_ELEMENTS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline',
    'text', 'tspan', 'defs', 'marker', 'clipPath', 'mask', 'pattern', 'linearGradient',
    'radialGradient', 'stop', 'symbol', 'use', 'style', 'title', 'desc',
]);
const EXTERNAL_CSS = /[@\\]|\b(?:image(?:-set)?|src)\s*\(|url\s*\((?!\s*['"]?#[\w.:-]+['"]?\s*\))/iu;
const MERMAID_BLOCK = /<pre\b[^>]*\bclass\s*=\s*(['"])[^'"]*\bmermaid\b[^'"]*\1[^>]*>([^<]*)<\/pre\s*>/iu;
let runtimeRequest;
export function findMermaidBlock(html) {
    const match = MERMAID_BLOCK.exec(html);
    if (!match || match[2].length > MAX_MERMAID_CHARS)
        return undefined;
    const decoder = document.createElement('textarea');
    decoder.innerHTML = match[2];
    return { markup: match[0], text: decoder.value };
}
export function findInlineSvg(html) {
    let depth = 0;
    let start = 0;
    for (const token of html.matchAll(/<\/?svg\b[^>]*>/giu)) {
        if (token[0].startsWith('</')) {
            if (depth > 0 && --depth === 0)
                return html.slice(start, token.index + token[0].length);
        }
        else if (!token[0].endsWith('/>')) {
            if (depth++ === 0)
                start = token.index;
        }
    }
    return undefined;
}
export function sanitizeExportSvg(source) {
    if (source.length > MAX_SVG_CHARS || /<!DOCTYPE|<!ENTITY/iu.test(source))
        throw new Error('Invalid SVG export.');
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root.localName !== 'svg' || parsed.querySelector('parsererror'))
        throw new Error('Invalid SVG export.');
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!SVG_ELEMENTS.has(element.localName)) {
            element.remove();
            continue;
        }
        if (element.localName === 'style') {
            // Keep paint rules when Mermaid emits animations beside them. This sheet
            // is never adopted, and CSSOM discards imports in a constructed sheet.
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(element.textContent ?? '');
            element.textContent = Array.from(sheet.cssRules)
                .filter(rule => rule.type === CSSRule.STYLE_RULE && !EXTERNAL_CSS.test(rule.cssText))
                .map(rule => rule.cssText).join('\n');
            if (!element.textContent) {
                element.remove();
                continue;
            }
        }
        for (const attribute of [...element.attributes]) {
            const key = attribute.localName.toLowerCase();
            if (key.startsWith('on') || key === 'base' || key === 'src'
                || (key === 'href' && !/^#[\w.:-]+$/u.test(attribute.value))
                || (key !== 'xmlns' && EXTERNAL_CSS.test(attribute.value)))
                element.removeAttributeNode(attribute);
        }
    }
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(root);
}
function loadRuntime() {
    runtimeRequest ??= fetch('/api/dsh-artifacts/mermaid-runtime', {
        credentials: 'same-origin', headers: { 'x-dsh-artifact-runtime': '1' }, signal: AbortSignal.timeout(5000),
    }).then(async (response) => {
        if (!response.ok)
            throw new Error('Local diagram runtime unavailable.');
        return response.text();
    }).catch(error => { runtimeRequest = undefined; throw error; });
    return runtimeRequest;
}
export async function renderOfflineMermaid(text, dark) {
    if (text.length > MAX_MERMAID_CHARS || !/^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|timeline)\b/u.test(text)) {
        throw new Error('Unsupported local diagram type.');
    }
    const runtime = await loadRuntime();
    const token = crypto.randomUUID();
    const json = (value) => JSON.stringify(value).replace(/</gu, '\\u003c');
    const parentOrigin = json(location.origin === 'null' ? '*' : location.origin);
    const frame = document.createElement('iframe');
    frame.className = 'dsh-offline-diagram-renderer';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:720px;pointer-events:none';
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
    <body><script>${runtime.replace(/<\/script/giu, '<\\/script')}</script><script>
      (async () => {
        try {
          mermaid.initialize({ startOnLoad:false, securityLevel:'strict', htmlLabels:false,
            maxTextSize:${MAX_MERMAID_CHARS}, maxEdges:200, theme:${dark ? "'dark'" : "'default'"},
            secure:['securityLevel','startOnLoad','htmlLabels','maxTextSize','maxEdges','secure'] });
          const {svg} = await mermaid.render('offline-diagram', ${json(text)});
          parent.postMessage({token:${json(token)},svg}, ${parentOrigin});
        } catch { parent.postMessage({token:${json(token)},error:true}, ${parentOrigin}); }
      })();
    </script></body>`;
    return new Promise((resolve, reject) => {
        const release = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); frame.remove(); };
        const onMessage = (event) => {
            if (event.origin !== 'null' || event.source !== frame.contentWindow || event.data?.token !== token)
                return;
            release();
            try {
                resolve(sanitizeExportSvg(typeof event.data.svg === 'string' ? event.data.svg : ''));
            }
            catch (error) {
                reject(error);
            }
        };
        const timer = setTimeout(() => { release(); reject(new Error('Local diagram rendering timed out.')); }, 8000);
        window.addEventListener('message', onMessage);
        document.body.append(frame);
    });
}
export function downloadDiagram(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function rasterizeDiagram(svg) {
    const url = URL.createObjectURL(svg);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(3, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
        if (!Number.isFinite(scale) || scale <= 0)
            throw new Error('Invalid diagram dimensions.');
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context)
            throw new Error('PNG export unavailable.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => canvas.toBlob(blob => {
            if (blob)
                resolve(blob);
            else
                reject(new Error('PNG export failed.'));
        }, 'image/png'));
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
