/** Recognize complete, quote-aware HTML tags and their attributes without a DOM. */
export const HTML_TAG = /<(\/?)([a-z][\w:-]*)(?=[\s/>])((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi;
export const HTML_ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
export const ARTIFACT_URL_ATTRIBUTE = /^(?:src|href|action|formaction|poster|cite|xlink:href|background|longdesc|manifest|profile|usemap|lowsrc|dynsrc|ping|srcset|imagesrcset|datasrc|itemid)$/i;
export function isArtifactResourceUrl(value) {
    return /^(?:#|blob:|data:(?:image|font|audio|video)\/)/i.test(value.trim());
}
export function isArtifactAttributeUrl(name, value) {
    if (/^(?:ping|srcset|imagesrcset|datasrc)$/i.test(name))
        return false;
    if (!value.trim())
        return !/^(?:action|formaction)$/i.test(name);
    if (/^(?:action|formaction)$/i.test(name))
        return value.trim().startsWith('#');
    return isArtifactResourceUrl(value);
}
/** Relative media in older static records remains blocked by the frame's resource CSP. */
export function isLegacyRelativeMediaUrl(tag, attribute, value) {
    const mediaResource = /^(?:img|audio|video|source|track|image|use|feimage|input)$/.test(tag)
        && /^(?:src|poster|href|xlink:href)$/.test(attribute);
    if (!mediaResource)
        return false;
    const url = value.trim();
    return url.length > 0 && !/^(?:\/\/|&)/.test(url) && !/[:\\\u0000-\u001f\u007f]/.test(url);
}
