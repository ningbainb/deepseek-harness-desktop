import { AsyncLocalStorage } from 'node:async_hooks';
/** Request-local access scope propagated through async host handlers. */
export class UserScopeRequestContext {
    storage = new AsyncLocalStorage();
    current() {
        return this.storage.getStore();
    }
    run(scope, callback) {
        return this.storage.run(scope, callback);
    }
}
