export const PLUGIN_IDS = ['prompt-pilot', 'dafeiyu-pet', 'builtin-browser'];
export const STATUS_PATH = '/api/desktop-release-plugins';
// These names are read from the reviewed vendor entries and official SDK declarations.
export const REQUIREMENTS = {
    'prompt-pilot': ['connection.fetch.register', 'agents.get', 'tools.register', 'llm.resolveModelInfo', 'llm.stream',
        'sessionProjections.register', 'sessionProjections.stateOf', 'sessionController.resolveAgent', 'sessionController.modelCatalog'],
    'dafeiyu-pet': ['webServer.register', 'webServer.tapIndex', 'credentials.resolve', 'credentials.set', 'connection.requestRejection'],
    'builtin-browser': ['browser.registerBrowserProvider', 'tools.register', 'systemPrompt.section'],
};
function methodAt(services, path) {
    let value = services;
    try {
        for (const key of path.split('.')) {
            if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
                return false;
            value = value[key];
        }
        return typeof value === 'function';
    }
    catch {
        return false;
    }
}
/** Read capability shape only: never call a model, tool, credential or session method. */
export function assessPlugin(id, services) {
    const missing = REQUIREMENTS[id].filter(path => !methodAt(services, path));
    return { id, status: missing.length ? 'waiting' : 'contracts-present', missing };
}
