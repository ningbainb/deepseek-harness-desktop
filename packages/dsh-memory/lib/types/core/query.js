import { MAX_MEMORY_QUERY_LENGTH, } from "./schema.js";
function textFromEvent(event) {
    if (event.type !== 'user/message' || event.data.source.kind !== 'user')
        return '';
    const blocks = event.data.content;
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
