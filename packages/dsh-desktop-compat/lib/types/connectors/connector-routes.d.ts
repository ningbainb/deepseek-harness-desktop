import type { Context } from '@deepseek-ai/cordis';
import type { ConnectorRegistryService } from './connector-registry-service.ts';
export declare function registerConnectorRoutes(ctx: Context, service: ConnectorRegistryService): () => void;
