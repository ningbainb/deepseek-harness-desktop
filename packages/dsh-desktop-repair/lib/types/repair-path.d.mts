/**
 * Compare resolved repair paths lexically. Callers traversing the filesystem
 * validate links and real paths separately.
 * @param {string} candidate
 * @param {string} parent
 */
export function isWithinRepairRoot(candidate: string, parent: string): boolean;
