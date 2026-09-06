import { AsyncLocalStorage } from 'node:async_hooks'
import type { AccessScope } from './core/schema.ts'

/** Request-local access scope propagated through async host handlers. */
export class UserScopeRequestContext {
  private readonly storage = new AsyncLocalStorage<AccessScope>()

  current(): AccessScope | undefined {
    return this.storage.getStore()
  }

  run<T>(scope: AccessScope, callback: () => T): T {
    return this.storage.run(scope, callback)
  }
}
