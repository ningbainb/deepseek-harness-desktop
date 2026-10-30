//#region src/core/contracts.ts
const PLUGIN_IDS = [
	"prompt-pilot",
	"dafeiyu-pet",
	"builtin-browser"
];
const STATUS_PATH = "/api/desktop-release-plugins";
const REQUIREMENTS = {
	"prompt-pilot": [
		"connection.fetch.register",
		"agents.get",
		"tools.register",
		"llm.resolveModelInfo",
		"llm.stream",
		"sessionProjections.register",
		"sessionProjections.stateOf",
		"sessionController.resolveAgent",
		"sessionController.modelCatalog"
	],
	"dafeiyu-pet": [
		"webServer.register",
		"webServer.tapIndex",
		"credentials.resolve",
		"credentials.set",
		"connection.requestRejection"
	],
	"builtin-browser": [
		"browser.registerBrowserProvider",
		"tools.register",
		"systemPrompt.section"
	]
};
function methodAt(services, path) {
	let value = services;
	try {
		for (const key of path.split(".")) {
			if (value === null || typeof value !== "object" && typeof value !== "function") return false;
			value = value[key];
		}
		return typeof value === "function";
	} catch {
		return false;
	}
}
/** Read capability shape only: never call a model, tool, credential or session method. */
function assessPlugin(id, services) {
	const missing = REQUIREMENTS[id].filter((path) => !methodAt(services, path));
	return {
		id,
		status: missing.length ? "waiting" : "contracts-present",
		missing
	};
}
//#endregion
//#region src/index.ts
const name = "release-plugin-adapter";
const inject = ["connection"];
/** The existing Connection carrier applies owner authentication before dispatch. */
function makeStatusRoute(snapshot) {
	return {
		path: STATUS_PATH,
		methods: ["GET"],
		requestBody: "buffered",
		async fetch(request) {
			if (request.method !== "GET") return new Response(null, {
				status: 405,
				headers: { allow: "GET" }
			});
			return Response.json({
				schemaVersion: 1,
				plugins: snapshot()
			}, { headers: { "cache-control": "no-store" } });
		}
	};
}
/** Supplement vendor rows; never duplicate their tools, projections, routes, or client factories. */
function apply(ctx) {
	const services = [...new Set(Object.values(REQUIREMENTS).flat().map((path) => path.split(".")[0]))];
	const snapshot = () => {
		const current = {};
		for (const service of services) try {
			current[service] = ctx.get(service, false);
		} catch {
			current[service] = void 0;
		}
		return PLUGIN_IDS.map((id) => assessPlugin(id, current));
	};
	ctx.effect(() => ctx.connection.fetch.register(makeStatusRoute(snapshot)), "release plugins: prerequisite route");
}
//#endregion
export { apply, inject, makeStatusRoute, name };
