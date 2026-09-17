export type PlatformUser = {
    id: string;
    email: string;
    name: string;
    avatarUrl: string;
    role: "user" | "admin";
    status: "active" | "disabled";
    points: number;
    createdAt: string;
};

export type PlatformAuthErrorKind = "api" | "network" | "response";

export class PlatformAuthError extends Error {
    constructor(
        message: string,
        readonly kind: PlatformAuthErrorKind,
        readonly status?: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = "PlatformAuthError";
    }
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RequestOptions = { fetch?: FetchImpl; signal?: AbortSignal };

const API_ROOT = "/api/auth";
const requestHeaders = { "Content-Type": "application/json", "X-Visora-Request": "1" };

export async function fetchPlatformUser(options?: RequestOptions): Promise<PlatformUser> {
    const data = await requestJson(`${API_ROOT}/me`, { method: "GET", signal: options?.signal }, options);
    return readUser(data);
}

export async function loginPlatformUser(input: { email: string; password: string }, options?: RequestOptions): Promise<PlatformUser> {
    const data = await requestJson(`${API_ROOT}/login`, { method: "POST", headers: requestHeaders, body: JSON.stringify(input), signal: options?.signal }, options);
    return readUser(data);
}

export async function registerPlatformUser(input: { email: string; password: string }, options?: RequestOptions): Promise<PlatformUser> {
    const data = await requestJson(`${API_ROOT}/register`, { method: "POST", headers: requestHeaders, body: JSON.stringify(input), signal: options?.signal }, options);
    return readUser(data);
}

export async function updatePlatformProfile(input: { name: string; avatarUrl: string }, options?: RequestOptions): Promise<PlatformUser> {
    const data = await requestJson(`${API_ROOT}/profile`, { method: "PATCH", headers: requestHeaders, body: JSON.stringify(input), signal: options?.signal }, options);
    return readUser(data);
}

export async function logoutPlatformUser(options?: RequestOptions): Promise<void> {
    await requestJson(`${API_ROOT}/logout`, { method: "POST", headers: requestHeaders, body: "{}", signal: options?.signal }, options);
}

export function safeReturnTo(value: string | null | undefined, fallback = "/canvas") {
    const candidate = value?.trim();
    if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f]/.test(candidate)) return fallback;

    let decoded = candidate;
    try {
        decoded = decodeURIComponent(candidate);
    } catch {
        return fallback;
    }
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return fallback;

    try {
        const base = "https://visora.invalid";
        const parsed = new URL(candidate, base);
        return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
    } catch {
        return fallback;
    }
}

async function requestJson(path: string, init: RequestInit, options?: RequestOptions): Promise<unknown> {
    let response: Response;
    try {
        response = await (options?.fetch || fetch)(path, { ...init, cache: "no-store", credentials: "same-origin" });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new PlatformAuthError("网络连接中断，请检查连接后重试。", "network");
    }

    const data = await readJson(response);
    if (!response.ok) {
        const error = readError(data);
        throw new PlatformAuthError(error.message || statusMessage(response.status), "api", response.status, error.code);
    }
    return data;
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => "");
    if (!text.trim()) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

function readUser(value: unknown): PlatformUser {
    const user = asRecord(asRecord(value).user);
    if (typeof user.id !== "string" || typeof user.email !== "string" || (user.role !== "user" && user.role !== "admin") || (user.status !== "active" && user.status !== "disabled") || typeof user.createdAt !== "string") {
        throw new PlatformAuthError("服务返回了无效响应，请稍后重试。", "response");
    }
    return {
        id: user.id,
        email: user.email,
        name: typeof user.name === "string" ? user.name : "",
        avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
        role: user.role,
        status: user.status,
        points: typeof user.points === "number" ? user.points : 0,
        createdAt: user.createdAt,
    };
}

function readError(value: unknown) {
    const error = asRecord(asRecord(value).error);
    return {
        code: typeof error.code === "string" ? error.code : undefined,
        message: typeof error.message === "string" && error.message.trim() ? error.message.trim() : "",
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function statusMessage(status: number) {
    if (status === 401) return "身份验证失败，请重新登录。";
    if (status === 403) return "当前账户无权执行此操作。";
    if (status === 503) return "服务暂时不可用，请稍后重试。";
    return `请求失败（HTTP ${status}）。`;
}
