import { ARTIFACT_MAX_BYTES, ArtifactValidationError, utf8ByteLength } from "./types.js";
/** Apply literal edits in order. Every anchor must match exactly once at its step. */
export function applyArtifactEdits(html, edits) {
    if (edits.length > 64)
        throw new ArtifactValidationError(['edits must contain at most 64 replacements']);
    for (const [index, { oldString, newString }] of edits.entries()) {
        const field = 'edits[' + index + '].oldString';
        if (!oldString)
            throw new ArtifactValidationError([field + ' must not be empty']);
        const start = html.indexOf(oldString);
        if (start === -1)
            throw new ArtifactValidationError([field + ' was not found in the current HTML']);
        if (html.indexOf(oldString, start + 1) !== -1) {
            throw new ArtifactValidationError([field + ' must be unique in the current HTML']);
        }
        if (newString.length > ARTIFACT_MAX_BYTES) {
            throw new ArtifactValidationError(['edits[' + index + '].newString exceeds the ' + ARTIFACT_MAX_BYTES + '-byte limit']);
        }
        html = html.slice(0, start) + newString + html.slice(start + oldString.length);
        if (utf8ByteLength(html) > ARTIFACT_MAX_BYTES) {
            throw new ArtifactValidationError(['edits[' + index + '] makes HTML exceed the ' + ARTIFACT_MAX_BYTES + '-byte limit']);
        }
    }
    return html;
}
