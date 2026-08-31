/**
 * Base abstract class for External Conversation Adapters.
 */

import { ADAPTER_STATUS } from '../schema.mjs'

export class ExternalConversationAdapter {
  /**
   * @param {string} id - Unique source identifier (e.g. 'claude-code', 'codex')
   * @param {string} displayName - Human readable name (e.g. 'Claude Code', 'Codex')
   */
  constructor(id, displayName) {
    if (!id || !displayName) throw new TypeError('Adapter id and displayName are required')
    this.id = id
    this.displayName = displayName
  }

  /**
   * Probe whether this external source is installed and accessible on local machine.
   * @param {object} [options]
   * @returns {Promise<{ available: boolean, status: string, rootDir?: string, reason?: string }>}
   */
  async probe(_options = {}) {
    return { available: false, status: ADAPTER_STATUS.UNAVAILABLE }
  }

  /**
   * Discover all local projects recorded by this tool.
   * @param {object} [options]
   * @returns {Promise<Array<{ projectRef: string, displayName: string, originalCwd: string, sessionCount: number, lastActiveAt?: number }>>}
   */
  async discoverProjects(_options = {}) {
    return []
  }

  /**
   * Discover all sessions belonging to a specific project.
   * @param {string} _projectRef
   * @param {object} [options]
   * @returns {Promise<Array<{ sessionRef: string, title?: string, createdAt?: number, updatedAt?: number, messageCount: number, status: string, fingerprint?: string }>>}
   */
  async discoverSessions(_projectRef, _options = {}) {
    return []
  }

  /**
   * Read and parse a session into ExternalConversationV1 normalized IR.
   * @param {string} _sessionRef
   * @param {object} [options]
   * @returns {Promise<import('../schema.mjs').ExternalConversationV1>}
   */
  async readConversation(_sessionRef, _options = {}) {
    throw new Error('readConversation not implemented')
  }

  /**
   * Compute a fast digest/fingerprint for this session to detect future updates.
   * @param {string} _sessionRef
   * @returns {Promise<string>}
   */
  async fingerprint(_sessionRef) {
    throw new Error('fingerprint not implemented')
  }
}
