import { MAX_MEMORY_QUERY_LENGTH, } from "./schema.js";
function textFromEvent(event) {
    if (event.type !== 'user/message' || event.data.source.kind !== 'user')
        return '';
    return directUserText(event.data);
}
function directUserText(message) {
    if (message.source.kind !== 'user')
        return '';
    const blocks = message.content;
    const text = blocks
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    // Attachment notes are references, not user facts. Image/Office bytes are
    // represented by other blocks and are never traversed here.
    return text
        .replace(/\[(?:image|file|office) attachment\b[^\]]*\]/giu, '')
        .replace(/<attachment\b[^>]*>[\s\S]*?<\/attachment>/giu, '')
        .trim();
}
/** Read uncommitted direct-user input from the official pre-step admission batch. */
export function extractPendingUserQuery(header, messages) {
    if (header.origin === 'subagent')
        return '';
    return messages.map(directUserText).filter(Boolean).join('\n').slice(0, MAX_MEMORY_QUERY_LENGTH);
}
/** Return only direct user text after the latest turn/start boundary. */
export function extractCurrentUserQuery(session) {
    if (session.header.origin === 'subagent')
        return '';
    const events = session.events;
    let start = -1;
    for (let index = 0; index < events.length; index += 1) {
        if (events[index]?.type === 'turn/start')
            start = index;
    }
    if (start < 0)
        return '';
    const messages = [];
    for (const event of events.slice(start + 1)) {
        const text = textFromEvent(event);
        if (text.length > 0)
            messages.push(text);
    }
    return messages.join('\n').slice(0, MAX_MEMORY_QUERY_LENGTH);
}
/** Propose one short, user-authored observation from the latest ended turn. */
export function proposeTurnMemory(snapshot, passive) {
    if (snapshot.header.origin === 'subagent')
        return undefined;
    const end = snapshot.events.findLastIndex(event => event.type === 'turn/end');
    if (end === -1)
        return undefined;
    const text = extractCurrentUserQuery({ ...snapshot, events: snapshot.events.slice(0, end + 1) });
    if (!text)
        return undefined;
    const lines = text.split(/[\r\n]+/u).map(line => line.trim()).filter(Boolean);
    const observation = lines.find(line => /(?:\b(?:prefer|remember|always use|default to)\b|记住|偏好|默认|以后(?:请|用)|始终)/iu.test(line));
    const proposed = observation ?? (passive ? undefined : lines[0]);
    return proposed ? [...proposed].slice(0, 320).join('') : undefined;
}
