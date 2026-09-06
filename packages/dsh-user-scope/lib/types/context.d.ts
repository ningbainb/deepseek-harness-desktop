import type { AccessScope } from './core/schema.ts';
/** Request-local access scope propagated through async host handlers. */
export declare class UserScopeRequestContext {
    private readonly storage;
    current(): AccessScope | undefined;
    run<T>(scope: AccessScope, callback: () => T): T;
}
//# sourceMappingURL=context.d.ts.map