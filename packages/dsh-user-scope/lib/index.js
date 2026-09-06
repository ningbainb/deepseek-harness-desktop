import { randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import { AsyncLocalStorage } from "node:async_hooks";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
//#region src/core/ids.ts
/** Deliberately excludes path separators, NUL, dot segments, and whitespace. */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function asOpaqueId(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128) return void 0;
	if (value === "." || value === ".." || /[\\/\u0000\s]/u.test(value)) return void 0;
	return OPAQUE_ID_PATTERN.test(value) ? value : void 0;
}
function asPrincipalId(value) {
	return asOpaqueId(value);
}
function asDeviceId(value) {
	return asOpaqueId(value);
}
function asWorkspaceId(value) {
	return asOpaqueId(value);
}
function asSessionId(value) {
	return asOpaqueId(value);
}
function requirePrincipalId(value) {
	const result = asPrincipalId(value);
	if (result === void 0) throw new TypeError("invalid principal id");
	return result;
}
function requireDeviceId(value) {
	const result = asDeviceId(value);
	if (result === void 0) throw new TypeError("invalid device id");
	return result;
}
function requireWorkspaceId(value) {
	const result = asWorkspaceId(value);
	if (result === void 0) throw new TypeError("invalid workspace id");
	return result;
}
function requireSessionId(value) {
	const result = asSessionId(value);
	if (result === void 0) throw new TypeError("invalid session id");
	return result;
}
//#endregion
//#region src/core/policy.ts
const deny = (reason) => ({
	allowed: false,
	reason
});
function workspaceExists(snapshot, workspaceId) {
	return snapshot.grants.some((item) => item.workspaceId === workspaceId) || snapshot.sessions.some((item) => item.workspaceId === workspaceId);
}
function hasWorkspaceGrant(snapshot, principalId, workspaceId) {
	return snapshot.grants.some((item) => item.principalId === principalId && item.workspaceId === workspaceId && item.permission === "use");
}
function hasSessionGrant(session, principalId) {
	return session.grantedPrincipalIds?.includes(principalId) === true;
}
function activeDevice(snapshot, scope) {
	if (scope.deviceId === void 0) return {
		ok: false,
		reason: "missing-device"
	};
	const binding = snapshot.devices.find((item) => item.deviceId === scope.deviceId);
	if (binding === void 0) return {
		ok: false,
		reason: "unknown-device"
	};
	if (binding.revokedAt !== void 0) return {
		ok: false,
		reason: "revoked-device"
	};
	if (binding.principalId !== scope.principalId) return {
		ok: false,
		reason: "device-principal-mismatch"
	};
	return { ok: true };
}
/** Central authorization decision used by desktop and remote consumers. */
function decideAccess(snapshot, localPrincipalId, scope, resource) {
	if (!snapshot.principals.some((item) => item.id === scope.principalId)) return deny("unknown-principal");
	if (scope.source === "desktop") {
		if (scope.principalId !== localPrincipalId) return deny("other-principal");
		if (resource.kind === "principal") return resource.principalId === localPrincipalId ? {
			allowed: true,
			reason: "allowed"
		} : deny("other-principal");
		if (resource.kind === "workspace") return workspaceExists(snapshot, resource.workspaceId) ? {
			allowed: true,
			reason: "allowed"
		} : deny("unknown-resource");
		return snapshot.sessions.some((item) => item.sessionId === resource.sessionId) ? {
			allowed: true,
			reason: "allowed"
		} : deny("unknown-resource");
	}
	const device = activeDevice(snapshot, scope);
	if (!device.ok) return deny(device.reason);
	if (resource.kind === "principal") return resource.principalId === scope.principalId ? {
		allowed: true,
		reason: "allowed"
	} : deny("other-principal");
	if (resource.kind === "workspace") {
		if (!workspaceExists(snapshot, resource.workspaceId)) return deny("unknown-resource");
		return hasWorkspaceGrant(snapshot, scope.principalId, resource.workspaceId) ? {
			allowed: true,
			reason: "allowed"
		} : deny("missing-workspace-grant");
	}
	const session = snapshot.sessions.find((item) => item.sessionId === resource.sessionId);
	if (session === void 0) return deny("unknown-resource");
	if (session.createdByPrincipalId !== scope.principalId && !hasSessionGrant(session, scope.principalId)) return deny("other-principal");
	if (session.workspaceId !== void 0 && !hasWorkspaceGrant(snapshot, scope.principalId, session.workspaceId)) return deny("missing-workspace-grant");
	return {
		allowed: true,
		reason: "allowed"
	};
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseVersion(value) {
	if (!isRecord(value) || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1) return {
		ok: false,
		kind: "invalid"
	};
	if (value.version > 1) return {
		ok: false,
		kind: "unsupported-version",
		version: value.version
	};
	if (value.version !== 1) return {
		ok: false,
		kind: "invalid"
	};
	return {
		ok: true,
		value: value.version
	};
}
function validTime(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function parsePrincipal(value) {
	if (!isRecord(value)) return void 0;
	const id = asPrincipalId(value.id);
	const kind = value.kind;
	if (id === void 0 || kind !== "local-profile" && kind !== "paired-device" || !validTime(value.createdAt)) return void 0;
	return {
		id,
		kind,
		createdAt: value.createdAt
	};
}
function parsePrincipalFile(value) {
	const version = parseVersion(value);
	if (!version.ok) return version;
	if (!isRecord(value)) return {
		ok: false,
		kind: "invalid"
	};
	const principal = parsePrincipal(value.principal);
	if (principal === void 0 || principal.kind !== "local-profile") return {
		ok: false,
		kind: "invalid"
	};
	return {
		ok: true,
		value: {
			version: 1,
			principal
		}
	};
}
function parseWorkspaceGrant(value) {
	if (!isRecord(value)) return void 0;
	const principalId = asPrincipalId(value.principalId);
	const workspaceId = asWorkspaceId(value.workspaceId);
	if (principalId === void 0 || workspaceId === void 0 || value.permission !== "use" || !validTime(value.createdAt)) return void 0;
	return {
		principalId,
		workspaceId,
		permission: "use",
		createdAt: value.createdAt
	};
}
function parseSessionOwnership(value) {
	if (!isRecord(value)) return void 0;
	const sessionId = asSessionId(value.sessionId);
	const owner = asPrincipalId(value.createdByPrincipalId);
	if (sessionId === void 0 || owner === void 0 || !validTime(value.createdAt) || !validTime(value.updatedAt)) return void 0;
	let workspaceId;
	if (value.workspaceId !== void 0) {
		workspaceId = asWorkspaceId(value.workspaceId);
		if (workspaceId === void 0) return void 0;
	}
	let grantedPrincipalIds;
	if (value.grantedPrincipalIds !== void 0) {
		if (!Array.isArray(value.grantedPrincipalIds)) return void 0;
		const parsed = value.grantedPrincipalIds.map(asPrincipalId);
		if (parsed.some((item) => item === void 0) || new Set(parsed).size !== parsed.length) return void 0;
		grantedPrincipalIds = parsed;
	}
	return {
		sessionId,
		...workspaceId === void 0 ? {} : { workspaceId },
		createdByPrincipalId: owner,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		...grantedPrincipalIds === void 0 ? {} : { grantedPrincipalIds }
	};
}
function parseDeviceBinding(value) {
	if (!isRecord(value)) return void 0;
	const deviceId = asDeviceId(value.deviceId);
	const principalId = asPrincipalId(value.principalId);
	if (deviceId === void 0 || principalId === void 0 || !validTime(value.createdAt) || !validTime(value.lastSeenAt)) return void 0;
	let revokedAt;
	if (value.revokedAt !== void 0) {
		if (!validTime(value.revokedAt)) return void 0;
		revokedAt = value.revokedAt;
	}
	let displayName;
	if (value.displayName !== void 0) {
		if (typeof value.displayName !== "string" || value.displayName.length > 128 || /[\u0000]/u.test(value.displayName)) return void 0;
		displayName = value.displayName;
	}
	return {
		deviceId,
		principalId,
		createdAt: value.createdAt,
		lastSeenAt: value.lastSeenAt,
		...displayName === void 0 ? {} : { displayName },
		...revokedAt === void 0 ? {} : { revokedAt }
	};
}
function unique(values) {
	return new Set(values).size === values.length;
}
function emptyOwnershipSnapshot(localPrincipal) {
	return {
		version: 1,
		principals: [{ ...localPrincipal }],
		devices: [],
		grants: [],
		sessions: []
	};
}
function parseOwnershipSnapshot(value) {
	const version = parseVersion(value);
	if (!version.ok) return version;
	if (!isRecord(value) || !Array.isArray(value.principals) || !Array.isArray(value.devices) || !Array.isArray(value.grants) || !Array.isArray(value.sessions)) return {
		ok: false,
		kind: "invalid"
	};
	const principals = value.principals.map(parsePrincipal);
	const devices = value.devices.map(parseDeviceBinding);
	const grants = value.grants.map(parseWorkspaceGrant);
	const sessions = value.sessions.map(parseSessionOwnership);
	if (principals.some((item) => item === void 0) || devices.some((item) => item === void 0) || grants.some((item) => item === void 0) || sessions.some((item) => item === void 0)) return {
		ok: false,
		kind: "invalid"
	};
	const resolvedPrincipals = principals;
	const resolvedDevices = devices;
	const resolvedGrants = grants;
	const resolvedSessions = sessions;
	if (!unique(resolvedPrincipals.map((item) => item.id)) || !unique(resolvedDevices.map((item) => item.deviceId)) || !unique(resolvedGrants.map((item) => `${item.principalId}:${item.workspaceId}`)) || !unique(resolvedSessions.map((item) => item.sessionId))) return {
		ok: false,
		kind: "invalid"
	};
	const principalIds = new Set(resolvedPrincipals.map((item) => item.id));
	if (resolvedPrincipals.filter((item) => item.kind === "local-profile").length > 1) return {
		ok: false,
		kind: "invalid"
	};
	if (resolvedDevices.some((item) => !principalIds.has(item.principalId)) || resolvedGrants.some((item) => !principalIds.has(item.principalId)) || resolvedSessions.some((item) => !principalIds.has(item.createdByPrincipalId)) || resolvedSessions.some((item) => item.grantedPrincipalIds?.some((principalId) => !principalIds.has(principalId)) === true)) return {
		ok: false,
		kind: "invalid"
	};
	return {
		ok: true,
		value: {
			version: 1,
			principals: resolvedPrincipals,
			devices: resolvedDevices,
			grants: resolvedGrants,
			sessions: resolvedSessions
		}
	};
}
//#endregion
//#region src/core/access.ts
function clonePrincipal(value) {
	return { ...value };
}
function cloneDevice(value) {
	return { ...value };
}
function cloneSession(value) {
	return {
		...value,
		...value.grantedPrincipalIds === void 0 ? {} : { grantedPrincipalIds: [...value.grantedPrincipalIds] }
	};
}
function cloneSnapshot(value) {
	return {
		version: value.version,
		principals: value.principals.map(clonePrincipal),
		devices: value.devices.map(cloneDevice),
		grants: value.grants.map((value) => ({ ...value })),
		sessions: value.sessions.map(cloneSession)
	};
}
/** In-memory ownership registry; persistence is supplied by UserScopeStore. */
var UserScopeRegistry = class {
	localPrincipal;
	state;
	constructor(localPrincipal, initial = emptyOwnershipSnapshot(localPrincipal)) {
		this.localPrincipal = localPrincipal;
		this.state = cloneSnapshot(initial);
		if (!this.state.principals.some((item) => item.id === localPrincipal.id)) this.state.principals.unshift(clonePrincipal(localPrincipal));
	}
	snapshot() {
		return cloneSnapshot(this.state);
	}
	replace(next) {
		this.state = cloneSnapshot(next);
	}
	principal(principalId) {
		const found = this.state.principals.find((item) => item.id === principalId);
		return found === void 0 ? void 0 : clonePrincipal(found);
	}
	principalForDevice(deviceId) {
		return this.state.devices.find((item) => item.deviceId === deviceId && item.revokedAt === void 0)?.principalId;
	}
	device(deviceId) {
		const found = this.state.devices.find((item) => item.deviceId === deviceId);
		return found === void 0 ? void 0 : cloneDevice(found);
	}
	addPrincipal(principal) {
		const existing = this.state.principals.find((item) => item.id === principal.id);
		if (existing !== void 0) {
			if (existing.kind !== principal.kind) throw new Error("principal id collision");
			return;
		}
		this.state.principals.push(clonePrincipal(principal));
	}
	registerDevice(binding) {
		if (!this.state.principals.some((item) => item.id === binding.principalId)) throw new Error("device principal is not registered");
		const existing = this.state.devices.find((item) => item.deviceId === binding.deviceId);
		if (existing !== void 0 && existing.principalId !== binding.principalId) throw new Error("device id collision");
		if (existing === void 0) {
			this.state.devices.push(cloneDevice(binding));
			return;
		}
		Object.assign(existing, cloneDevice(binding));
	}
	touchDevice(deviceId, now) {
		const binding = this.state.devices.find((item) => item.deviceId === deviceId);
		if (binding === void 0 || binding.revokedAt !== void 0) return false;
		binding.lastSeenAt = now;
		return true;
	}
	revokeDevice(deviceId, revokedAt) {
		const binding = this.state.devices.find((item) => item.deviceId === deviceId);
		if (binding === void 0 || binding.revokedAt !== void 0) return false;
		binding.revokedAt = revokedAt;
		return true;
	}
	grantWorkspace(grant) {
		if (!this.state.principals.some((item) => item.id === grant.principalId)) throw new Error("grant principal is not registered");
		if (this.state.grants.find((item) => item.principalId === grant.principalId && item.workspaceId === grant.workspaceId) === void 0) this.state.grants.push({ ...grant });
	}
	revokeWorkspace(principalId, workspaceId) {
		const before = this.state.grants.length;
		this.state.grants = this.state.grants.filter((item) => !(item.principalId === principalId && item.workspaceId === workspaceId));
		return this.state.grants.length !== before;
	}
	registerSession(ownership) {
		if (!this.state.principals.some((item) => item.id === ownership.createdByPrincipalId)) throw new Error("session principal is not registered");
		const existing = this.state.sessions.find((item) => item.sessionId === ownership.sessionId);
		if (existing !== void 0 && existing.createdByPrincipalId !== ownership.createdByPrincipalId) throw new Error("session ownership collision");
		if (existing === void 0) this.state.sessions.push(cloneSession(ownership));
		else Object.assign(existing, cloneSession(ownership));
	}
	grantSession(principalId, sessionId) {
		if (!this.state.principals.some((item) => item.id === principalId)) throw new Error("session grant principal is not registered");
		const session = this.state.sessions.find((item) => item.sessionId === sessionId);
		if (session === void 0) throw new Error("session grant target is not registered");
		const grants = session.grantedPrincipalIds ?? [];
		if (!grants.includes(principalId)) session.grantedPrincipalIds = [...grants, principalId];
	}
	revokeSession(principalId, sessionId) {
		const session = this.state.sessions.find((item) => item.sessionId === sessionId);
		if (session === void 0 || session.grantedPrincipalIds === void 0) return false;
		const next = session.grantedPrincipalIds.filter((item) => item !== principalId);
		if (next.length === session.grantedPrincipalIds.length) return false;
		if (next.length === 0) delete session.grantedPrincipalIds;
		else session.grantedPrincipalIds = next;
		return true;
	}
	removeSession(sessionId) {
		const before = this.state.sessions.length;
		this.state.sessions = this.state.sessions.filter((item) => item.sessionId !== sessionId);
		return this.state.sessions.length !== before;
	}
	access(scope, resource) {
		return decideAccess(this.state, this.localPrincipal.id, scope, resource);
	}
	visibleSessions(scope) {
		return this.state.sessions.filter((session) => this.access(scope, {
			kind: "session",
			sessionId: session.sessionId
		}).allowed).map(cloneSession);
	}
};
//#endregion
//#region src/context.ts
/** Request-local access scope propagated through async host handlers. */
var UserScopeRequestContext = class {
	storage = new AsyncLocalStorage();
	current() {
		return this.storage.getStore();
	}
	run(scope, callback) {
		return this.storage.run(scope, callback);
	}
};
//#endregion
//#region src/store.ts
const USER_SCOPE_DIR_MODE = 448;
const USER_SCOPE_FILE_MODE = 384;
var UserScopeStoreError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "UserScopeStoreError";
	}
};
var UnsupportedSchemaVersionError = class extends UserScopeStoreError {
	filename;
	version;
	constructor(filename, version) {
		super(`unsupported user-scope schema version ${String(version)}`, "unsupported-version");
		this.filename = filename;
		this.version = version;
		this.name = "UnsupportedSchemaVersionError";
	}
};
var CorruptUserScopeError = class extends UserScopeStoreError {
	filename;
	constructor(filename) {
		super("user-scope state is invalid", "corrupt");
		this.filename = filename;
		this.name = "CorruptUserScopeError";
	}
};
function errorCode(error) {
	if (!error || typeof error !== "object") return void 0;
	const code = error.code;
	return typeof code === "string" ? code : void 0;
}
/** Official-SDK-backed private persistence for principal and ownership files. */
var UserScopeStore = class {
	rootDir;
	principalFilename;
	ownershipFilename;
	lockWaitMs;
	constructor(options = {}) {
		this.rootDir = resolve(options.rootDir ?? dshHomePath("user-scope"));
		this.principalFilename = resolve(this.rootDir, "principal.json");
		this.ownershipFilename = resolve(this.rootDir, "ownership.json");
		this.lockWaitMs = options.lockWaitMs ?? 1e4;
	}
	async ensureLocalPrincipal(create) {
		await this.ensureRoot();
		return withFileLock(this.principalFilename, async () => {
			const existing = await this.readPrincipalUnlocked();
			if (existing !== void 0) return existing;
			const principal = create();
			const parsed = parsePrincipalFile({
				version: 1,
				principal
			});
			if (!parsed.ok) throw new CorruptUserScopeError(this.principalFilename);
			await this.writeJson(this.principalFilename, parsed.value);
			return principal;
		}, { waitMs: this.lockWaitMs });
	}
	async loadOwnership() {
		await this.ensureRoot();
		return withFileLock(this.ownershipFilename, async () => this.readOwnershipUnlocked(), { waitMs: this.lockWaitMs });
	}
	async saveOwnership(snapshot) {
		await this.ensureRoot();
		const parsed = parseOwnershipSnapshot(snapshot);
		if (!parsed.ok) this.throwParseFailure(this.ownershipFilename, parsed);
		await withFileLock(this.ownershipFilename, async () => {
			await this.writeJson(this.ownershipFilename, parsed.value);
		}, { waitMs: this.lockWaitMs });
	}
	async updateOwnership(update) {
		await this.ensureRoot();
		return withFileLock(this.ownershipFilename, async () => {
			const parsed = parseOwnershipSnapshot(await update(await this.readOwnershipUnlocked()));
			if (!parsed.ok) this.throwParseFailure(this.ownershipFilename, parsed);
			await this.writeJson(this.ownershipFilename, parsed.value);
			return parsed.value;
		});
	}
	async ensureRoot() {
		await mkdir(this.rootDir, {
			recursive: true,
			mode: 448
		});
		try {
			await chmod(this.rootDir, 448);
		} catch (error) {
			if (process.platform !== "win32") throw error;
		}
	}
	async readPrincipalUnlocked() {
		const value = await this.readJson(this.principalFilename);
		if (value === void 0) return void 0;
		const parsed = parsePrincipalFile(value);
		if (!parsed.ok && parsed.kind === "invalid") await this.backupCorruptFile(this.principalFilename);
		if (!parsed.ok) this.throwParseFailure(this.principalFilename, parsed);
		return parsed.value.principal;
	}
	async readOwnershipUnlocked() {
		const value = await this.readJson(this.ownershipFilename);
		if (value === void 0) return void 0;
		const parsed = parseOwnershipSnapshot(value);
		if (!parsed.ok && parsed.kind === "invalid") await this.backupCorruptFile(this.ownershipFilename);
		if (!parsed.ok) this.throwParseFailure(this.ownershipFilename, parsed);
		return parsed.value;
	}
	async readJson(filename) {
		let raw;
		try {
			raw = await readFile(filename, "utf8");
		} catch (error) {
			if (errorCode(error) === "ENOENT") return void 0;
			throw new UserScopeStoreError("unable to read user-scope state", "io");
		}
		try {
			return JSON.parse(raw);
		} catch {
			await this.backupCorruptFile(filename, raw);
			throw new CorruptUserScopeError(filename);
		}
	}
	/** Keep the first invalid snapshot for operator recovery without touching the source file. */
	async backupCorruptFile(filename, content) {
		const backupFilename = filename + ".corrupt";
		let backupContent = content;
		if (backupContent === void 0) try {
			backupContent = await readFile(filename, "utf8");
		} catch {
			return;
		}
		try {
			await readFile(backupFilename, "utf8");
			return;
		} catch (error) {
			if (errorCode(error) !== "ENOENT") return;
		}
		try {
			await writeFileAtomic(backupFilename, backupContent, {
				mode: 384,
				dirMode: 448
			});
		} catch {}
	}
	async writeJson(filename, value) {
		try {
			await writeFileAtomic(filename, `${JSON.stringify(value, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
		} catch {
			throw new UserScopeStoreError("unable to write user-scope state", "io");
		}
	}
	throwParseFailure(filename, failure) {
		if (failure.kind === "unsupported-version") throw new UnsupportedSchemaVersionError(filename, failure.version);
		throw new CorruptUserScopeError(filename);
	}
};
//#endregion
//#region src/index.ts
const name = "user-scope";
const inject = ["sessions", "workspaceRegistry"];
var UserScopeUnavailableError = class extends Error {
	constructor() {
		super("user-scope is unavailable; access is closed");
		this.name = "UserScopeUnavailableError";
	}
};
/** Host service shared by remote isolation, personal Prompt, and memory. */
var UserScopeService = class extends Service {
	static inject = [];
	store;
	requests = new UserScopeRequestContext();
	now;
	localPrincipalValue;
	registryValue;
	availability = "loading";
	bootError;
	bootPromise;
	constructor(ctx, config = {}) {
		super(ctx, "userScope");
		this.now = config.now ?? (() => Date.now());
		this.store = new UserScopeStore(config);
		this.localPrincipalValue = this.newPrincipal("local-profile");
		this.registryValue = new UserScopeRegistry(this.localPrincipalValue);
		this.bootPromise = this.bootstrap();
	}
	async ready() {
		await this.bootPromise;
	}
	availabilityState() {
		return this.availability;
	}
	diagnostics() {
		return {
			state: this.availability,
			principalId: this.localPrincipalValue.id,
			...this.bootError instanceof UserScopeStoreError ? { errorCode: this.bootError.code } : {}
		};
	}
	localPrincipal() {
		return { ...this.localPrincipalValue };
	}
	snapshot() {
		return this.registryValue.snapshot();
	}
	currentScope() {
		return this.requests.current();
	}
	/** The local profile scope used by unscoped Host lifecycle events. */
	desktopScope() {
		return this.availability === "blocked" ? void 0 : {
			principalId: this.localPrincipalValue.id,
			source: "desktop"
		};
	}
	run(scope, callback) {
		return this.requests.run(scope, callback);
	}
	canAccess(scope, resource) {
		if (this.availability !== "ready") return {
			allowed: false,
			reason: "scope-unavailable"
		};
		return this.registryValue.access(scope, resource);
	}
	visibleSessions(scope) {
		if (this.availability !== "ready") return [];
		return this.registryValue.visibleSessions(scope);
	}
	principalForDevice(deviceId) {
		const parsed = asDeviceId(deviceId);
		return parsed === void 0 ? void 0 : this.registryValue.principalForDevice(parsed);
	}
	touchDevice(deviceId) {
		if (this.availability !== "ready") return false;
		const parsed = asDeviceId(deviceId);
		return parsed !== void 0 && this.registryValue.touchDevice(parsed, this.now());
	}
	async bindDevice(deviceId, displayName) {
		await this.requireReady();
		const parsedDeviceId = asDeviceId(deviceId);
		if (parsedDeviceId === void 0) throw new TypeError("invalid device id");
		const existing = this.registryValue.device(parsedDeviceId);
		if (existing !== void 0) {
			if (existing.revokedAt !== void 0) throw new Error("device is revoked");
			return {
				deviceId: existing.deviceId,
				principalId: existing.principalId
			};
		}
		const principal = this.newPrincipal("paired-device");
		const binding = {
			deviceId: parsedDeviceId,
			principalId: principal.id,
			createdAt: this.now(),
			lastSeenAt: this.now(),
			...displayName === void 0 ? {} : { displayName: displayName.slice(0, 128) }
		};
		await this.commit((registry) => {
			registry.addPrincipal(principal);
			registry.registerDevice(binding);
		});
		return {
			deviceId: parsedDeviceId,
			principalId: principal.id
		};
	}
	async revokeDevice(deviceId) {
		await this.requireReady();
		const parsed = asDeviceId(deviceId);
		if (parsed === void 0) throw new TypeError("invalid device id");
		let changed = false;
		await this.commit((registry) => {
			changed = registry.revokeDevice(parsed, this.now());
		});
		return changed;
	}
	async grantWorkspace(principalId, workspaceId) {
		await this.requireReady();
		const principal = asPrincipalId(principalId);
		const workspace = asWorkspaceId(workspaceId);
		if (principal === void 0 || workspace === void 0) throw new TypeError("invalid workspace grant");
		await this.commit((registry) => {
			registry.grantWorkspace({
				principalId: principal,
				workspaceId: workspace,
				permission: "use",
				createdAt: this.now()
			});
		});
	}
	async revokeWorkspace(principalId, workspaceId) {
		await this.requireReady();
		const principal = asPrincipalId(principalId);
		const workspace = asWorkspaceId(workspaceId);
		if (principal === void 0 || workspace === void 0) throw new TypeError("invalid workspace grant");
		let changed = false;
		await this.commit((registry) => {
			changed = registry.revokeWorkspace(principal, workspace);
		});
		return changed;
	}
	async grantSession(principalId, sessionId) {
		await this.requireReady();
		const principal = asPrincipalId(principalId);
		const session = asSessionId(sessionId);
		if (principal === void 0 || session === void 0) throw new TypeError("invalid session grant");
		await this.commit((registry) => {
			registry.grantSession(principal, session);
		});
	}
	async revokeSession(principalId, sessionId) {
		await this.requireReady();
		const principal = asPrincipalId(principalId);
		const session = asSessionId(sessionId);
		if (principal === void 0 || session === void 0) throw new TypeError("invalid session grant");
		let changed = false;
		await this.commit((registry) => {
			changed = registry.revokeSession(principal, session);
		});
		return changed;
	}
	async registerSession(input) {
		await this.requireReady();
		const sessionId = asSessionId(input.sessionId);
		const owner = asPrincipalId(input.createdByPrincipalId ?? this.localPrincipalValue.id);
		const workspaceId = input.workspaceId === void 0 ? void 0 : asWorkspaceId(input.workspaceId);
		if (sessionId === void 0 || owner === void 0 || input.workspaceId !== void 0 && workspaceId === void 0) throw new TypeError("invalid session ownership");
		const timestamp = input.createdAt ?? this.now();
		const ownership = {
			sessionId,
			...workspaceId === void 0 ? {} : { workspaceId },
			createdByPrincipalId: owner,
			createdAt: timestamp,
			updatedAt: this.now()
		};
		await this.commit((registry) => {
			registry.registerSession(ownership);
		});
	}
	async removeSession(sessionId) {
		await this.requireReady();
		const parsed = asSessionId(sessionId);
		if (parsed === void 0) throw new TypeError("invalid session id");
		let changed = false;
		await this.commit((registry) => {
			changed = registry.removeSession(parsed);
		});
		return changed;
	}
	newPrincipal(kind) {
		const id = asPrincipalId(`${kind === "local-profile" ? "principal-local" : "principal-device"}-${randomUUID()}`);
		if (id === void 0) throw new Error("failed to mint principal id");
		return {
			id,
			kind,
			createdAt: this.now()
		};
	}
	async bootstrap() {
		try {
			const local = await this.store.ensureLocalPrincipal(() => this.localPrincipalValue);
			this.localPrincipalValue = local;
			let ownership = await this.store.loadOwnership();
			let needsWrite = false;
			if (ownership === void 0) {
				ownership = emptyOwnershipSnapshot(local);
				needsWrite = true;
			} else {
				const persistedLocal = ownership.principals.find((item) => item.kind === "local-profile");
				if (persistedLocal !== void 0 && persistedLocal.id !== local.id) throw new CorruptUserScopeError(this.store.ownershipFilename);
				if (persistedLocal === void 0) {
					ownership = {
						...ownership,
						principals: [{ ...local }, ...ownership.principals]
					};
					needsWrite = true;
				}
			}
			this.registryValue = new UserScopeRegistry(local, ownership);
			if (needsWrite) await this.store.saveOwnership(ownership);
			this.availability = "ready";
		} catch (error) {
			this.bootError = error;
			this.availability = "blocked";
			console.warn("user-scope: persistent state unavailable; access is closed");
		}
	}
	async requireReady() {
		await this.ready();
		if (this.availability !== "ready") throw new UserScopeUnavailableError();
	}
	async commit(change) {
		await this.requireReady();
		const next = await this.store.updateOwnership((current) => {
			const source = current ?? this.registryValue.snapshot();
			const persistedLocal = source.principals.find((item) => item.kind === "local-profile");
			if (persistedLocal !== void 0 && persistedLocal.id !== this.localPrincipalValue.id) throw new CorruptUserScopeError(this.store.ownershipFilename);
			const working = new UserScopeRegistry(this.localPrincipalValue, source);
			change(working);
			return working.snapshot();
		});
		this.registryValue.replace(next);
	}
};
/**
* Register a live session from the official SessionStore lifecycle. Remote
* sessions must already resolve to a workspace; the explicit mobile create
* route registers them with its checked workspace after the Host call.
*/
function registerLiveSession(service, session, workspaceRegistry) {
	const scope = service.currentScope() ?? service.desktopScope();
	if (scope === void 0) return;
	let workspaceId;
	try {
		workspaceId = workspaceRegistry.list().find((workspace) => workspace.sessionIds.some((sessionId) => String(sessionId) === String(session.id)))?.id;
	} catch {}
	if (scope.source === "remote" && workspaceId === void 0) return;
	service.registerSession({
		sessionId: String(session.id),
		...workspaceId === void 0 ? {} : { workspaceId },
		createdByPrincipalId: scope.principalId,
		createdAt: session.header.createdAt
	}).catch(() => {});
}
/** Cordis plugin entry; the service registration is intentionally host-only. */
function apply(ctx, config = {}) {
	const service = new UserScopeService(ctx, config);
	ctx.on("session/created", (session) => {
		registerLiveSession(service, session, ctx.workspaceRegistry);
	});
	for (const session of ctx.sessions.list()) registerLiveSession(service, session, ctx.workspaceRegistry);
}
//#endregion
export { CorruptUserScopeError, OPAQUE_ID_PATTERN, USER_SCOPE_DIR_MODE, USER_SCOPE_FILE_MODE, UnsupportedSchemaVersionError, UserScopeRegistry, UserScopeRequestContext, UserScopeService, UserScopeStore, UserScopeStoreError, UserScopeUnavailableError, apply, asDeviceId, asPrincipalId, asSessionId, asWorkspaceId, decideAccess, inject, name, requireDeviceId, requirePrincipalId, requireSessionId, requireWorkspaceId };
