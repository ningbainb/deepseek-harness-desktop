import { ARTIFACT_URL_ATTRIBUTE, HTML_ATTRIBUTE, HTML_TAG, isArtifactAttributeUrl } from "./html.js";
import { ARTIFACT_MAX_BYTES, utf8ByteLength, validateArtifactHtml } from "./types.js";
const voidTags = new Set('area br col hr img input source track wbr'.split(' '));
const visibleTags = new Set(('a abbr address article aside audio b bdi bdo blockquote button canvas caption circle clipPath code colgroup '
    + 'data dd defs del details dfn dialog div dl dt ellipse em fieldset figcaption figure footer g h1 h2 h3 h4 h5 h6 '
    + 'header i image kbd label legend li line linearGradient main mark mask menu meter nav ol optgroup option output p '
    + 'path pattern picture polygon polyline pre progress q radialGradient rect rp rt ruby s samp section select small '
    + 'span stop strong sub summary sup svg symbol table tbody td text textPath tfoot th thead time tr tspan u ul use '
    + 'var video').toLowerCase().split(' '));
const blockedContent = new Set('script iframe object portal fencedframe applet noscript noembed noframes template xmp plaintext'.split(' '));
const rawContent = new Set(['style', 'textarea', 'title']);
function streamingAttributes(tag, markup) {
    const attributes = [];
    for (const attribute of markup.matchAll(HTML_ATTRIBUTE)) {
        const rawName = attribute[1];
        const name = rawName.toLowerCase();
        const value = attribute[2] ?? attribute[3] ?? attribute[4];
        if (!/^[a-z_:][\w:.-]*$/i.test(name) || /^on/i.test(name))
            continue;
        if (/^(?:autofocus|autoplay|download|srcdoc|form|target|shadowroot.*|xmlns.*)$/i.test(name))
            continue;
        if (ARTIFACT_URL_ATTRIBUTE.test(name)) {
            if ((tag === 'a' || tag === 'area') && !value?.trim().startsWith('#'))
                continue;
            if (!isArtifactAttributeUrl(name, value ?? ''))
                continue;
        }
        if (value && (name === 'style' || /url\s*\(/i.test(value)) && validateArtifactHtml(value).length > 0)
            continue;
        attributes.push(' ' + rawName + (value === undefined ? '' : '="' + value.replaceAll('"', '&quot;') + '"'));
    }
    return attributes.join('');
}
/** Create an inert, balanced fragment from the complete markup of a streaming prefix. */
export function sanitizeStreamingHtml(html) {
    if (html.length > ARTIFACT_MAX_BYTES || utf8ByteLength(html) > ARTIFACT_MAX_BYTES)
        return undefined;
    const chunks = [];
    const openTags = [];
    const tagAt = new RegExp(HTML_TAG.source, 'iy');
    let cursor = 0;
    while (cursor < html.length) {
        const start = html.indexOf('<', cursor);
        if (start === -1) {
            chunks.push(html.slice(cursor));
            break;
        }
        chunks.push(html.slice(cursor, start));
        if (html.startsWith('<!--', start)) {
            const end = html.indexOf('-->', start + 4);
            if (end === -1)
                break;
            cursor = end + 3;
            continue;
        }
        if (/^[!?]/.test(html.charAt(start + 1))) {
            const end = html.indexOf('>', start + 2);
            if (end === -1)
                break;
            cursor = end + 1;
            continue;
        }
        tagAt.lastIndex = start;
        const tag = tagAt.exec(html);
        if (!tag) {
            if (/^[a-z/]/i.test(html.charAt(start + 1)) || start === html.length - 1)
                break;
            chunks.push('&lt;');
            cursor = start + 1;
            continue;
        }
        const rawName = tag[2];
        const name = rawName.toLowerCase();
        const markup = tag[3];
        cursor = tagAt.lastIndex;
        if (tag[1]) {
            const match = openTags.findLastIndex(open => open.name === name);
            if (match < 0)
                continue;
            while (openTags.length > match)
                chunks.push('</' + openTags.pop().rawName + '>');
            continue;
        }
        if (blockedContent.has(name) || rawContent.has(name)) {
            const close = new RegExp('</' + name + '\\s*>', 'gi');
            close.lastIndex = cursor;
            const end = close.exec(html);
            if (!end)
                break;
            if (rawContent.has(name)) {
                const body = html.slice(cursor, end.index);
                if (name === 'style') {
                    const style = '<style>' + body + '</style>';
                    if (validateArtifactHtml(style).length === 0)
                        chunks.push(style);
                }
                else {
                    chunks.push('<' + name + streamingAttributes(name, markup) + '>' + body.replaceAll('<', '&lt;') + '</' + name + '>');
                }
            }
            cursor = close.lastIndex;
            continue;
        }
        if (!visibleTags.has(name) && !voidTags.has(name))
            continue;
        const selfClosing = /\/\s*$/.test(markup) && (name === 'svg' || openTags.some(open => open.name === 'svg'));
        chunks.push('<' + rawName + streamingAttributes(name, markup) + (selfClosing ? '/>' : '>'));
        if (!selfClosing && !voidTags.has(name)) {
            openTags.push({ name, rawName });
            if (openTags.length >= 256)
                break;
        }
    }
    while (openTags.length)
        chunks.push('</' + openTags.pop().rawName + '>');
    const preview = chunks.join('').replaceAll('\u0000', '');
    return utf8ByteLength(preview) <= ARTIFACT_MAX_BYTES ? preview : undefined;
}
