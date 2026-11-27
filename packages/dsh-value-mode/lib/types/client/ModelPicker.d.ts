import React from 'react';
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import { BAI_PROVIDER_ID, type ModelRouteSelection } from '../core/config.ts';
import { type ModelCatalogLoader } from './model-catalog.ts';
export type { ValueModeModelCatalog } from './model-catalog.ts';
export interface ModelPickerProps {
    title: string;
    current?: ModelRouteSelection;
    onSelect: (selection: ModelRouteSelection) => void;
    onClose: () => void;
    fetchModels?: ModelCatalogLoader;
}
export { BAI_PROVIDER_ID };
/** Keep the Desktop-recommended bai provider first without disturbing the catalog's remaining order. */
export declare function sortValueModeProviderGroups(groups: readonly ModelProviderGroup[]): readonly ModelProviderGroup[];
export declare const ModelPicker: React.FC<ModelPickerProps>;
//# sourceMappingURL=ModelPicker.d.ts.map