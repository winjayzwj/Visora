import { create } from "zustand";

import { fetchPlatformUser, loginPlatformUser, logoutPlatformUser, registerPlatformUser, updatePlatformProfile, PlatformAuthError, type PlatformUser } from "../services/api/platform-auth";

type PlatformAuthClient = {
    fetchPlatformUser: typeof fetchPlatformUser;
    loginPlatformUser: typeof loginPlatformUser;
    registerPlatformUser: typeof registerPlatformUser;
    logoutPlatformUser: typeof logoutPlatformUser;
    updatePlatformProfile: typeof updatePlatformProfile;
};

type PlatformAuthStore = {
    user: PlatformUser | null;
    checking: boolean;
    loggingIn: boolean;
    registering: boolean;
    loggingOut: boolean;
    updatingProfile: boolean;
    error: PlatformAuthError | null;
    check: () => Promise<PlatformUser | null>;
    login: (email: string, password: string) => Promise<PlatformUser | null>;
    register: (email: string, password: string) => Promise<PlatformUser | null>;
    updateProfile: (input: { name: string; avatarUrl: string }) => Promise<PlatformUser | null>;
    logout: () => Promise<void>;
};

const platformAuthClient: PlatformAuthClient = { fetchPlatformUser, loginPlatformUser, registerPlatformUser, logoutPlatformUser, updatePlatformProfile };

export function createPlatformAuthStore(overrides: Partial<PlatformAuthClient> = {}) {
    const client = { ...platformAuthClient, ...overrides };
    let requestVersion = 0;
    const nextRequest = () => ++requestVersion;
    const isCurrent = (version: number) => version === requestVersion;

    return create<PlatformAuthStore>((set, get) => ({
        user: null,
        checking: false,
        loggingIn: false,
        registering: false,
        loggingOut: false,
        updatingProfile: false,
        error: null,
        check: async () => {
            // A read must not retire a Cookie-writing request or its reconciliation.
            if (isBusy(get())) return null;
            const version = nextRequest();
            set({ checking: true, error: null });
            try {
                const user = await client.fetchPlatformUser();
                if (!isCurrent(version)) return null;
                set({ user, checking: false, error: null });
                return user;
            } catch (error) {
                if (!isCurrent(version)) return null;
                if (error instanceof PlatformAuthError && error.status === 401) {
                    set({ user: null, checking: false, error: null });
                    return null;
                }
                const authError = normalizeError(error);
                set({ checking: false, error: authError });
                throw authError;
            }
        },
        login: async (email, password) => {
            if (isBusy(get())) throw authBusyError();
            const version = nextRequest();
            set({ checking: false, loggingIn: true, loggingOut: false, error: null });
            try {
                const user = await client.loginPlatformUser({ email, password });
                if (!isCurrent(version)) return null;
                set({ user, checking: false, loggingIn: false, loggingOut: false, error: null });
                return user;
            } catch (error) {
                if (!isCurrent(version)) return null;
                const authError = normalizeError(error);
                set({ checking: false, loggingIn: false, loggingOut: false, error: authError });
                throw authError;
            }
        },
        register: async (email, password) => {
            if (isBusy(get())) throw authBusyError();
            const version = nextRequest();
            set({ checking: false, registering: true, loggingIn: false, loggingOut: false, error: null });
            try {
                const user = await client.registerPlatformUser({ email, password });
                if (!isCurrent(version)) return null;
                set({ user, checking: false, registering: false, loggingIn: false, loggingOut: false, error: null });
                return user;
            } catch (error) {
                if (!isCurrent(version)) return null;
                const authError = normalizeError(error);
                set({ checking: false, registering: false, error: authError });
                throw authError;
            }
        },
        updateProfile: async (input) => {
            if (isBusy(get())) throw authBusyError();
            const version = nextRequest();
            set({ checking: false, updatingProfile: true, error: null });
            try {
                const user = await client.updatePlatformProfile(input);
                if (!isCurrent(version)) return null;
                set({ user, checking: false, updatingProfile: false, error: null });
                return user;
            } catch (error) {
                if (!isCurrent(version)) return null;
                const authError = normalizeError(error);
                set({ checking: false, updatingProfile: false, error: authError });
                throw authError;
            }
        },
        logout: async () => {
            if (isBusy(get())) throw authBusyError();
            nextRequest();
            // Acquire synchronously, and hold until the response and any /me reconciliation finish.
            set({ checking: false, loggingOut: true, error: null });
            try {
                await client.logoutPlatformUser();
                set({ user: null });
            } catch (error) {
                const authError = normalizeError(error);
                const failureMessage = `退出登录失败：${authError.message}`;
                let feedback = new PlatformAuthError(failureMessage, authError.kind, authError.status, authError.code);
                set({ checking: true, error: feedback });
                try {
                    const user = await client.fetchPlatformUser();
                    set({ user });
                    feedback = new PlatformAuthError(`${failureMessage} 当前会话仍有效，可重试退出。`, authError.kind, authError.status, authError.code);
                } catch (checkError) {
                    if (checkError instanceof PlatformAuthError && checkError.status === 401) {
                        set({ user: null });
                        feedback = new PlatformAuthError(`${failureMessage} 已核对当前无有效会话。`, authError.kind, authError.status, authError.code);
                    } else {
                        feedback = new PlatformAuthError(`${failureMessage} 会话核对失败：${normalizeError(checkError).message}`, authError.kind, authError.status, authError.code);
                    }
                }
                set({ error: feedback });
                throw feedback;
            } finally {
                set({ loggingOut: false, checking: false });
            }
        },
    }));
}

export const usePlatformAuthStore = createPlatformAuthStore();

function normalizeError(error: unknown) {
    return error instanceof PlatformAuthError ? error : new PlatformAuthError("请求失败，请稍后重试。", "response");
}

function authBusyError() {
    return new PlatformAuthError("账户操作进行中，请等待完成。", "response", undefined, "AUTH_BUSY");
}

function isBusy(state: Pick<PlatformAuthStore, "loggingIn" | "registering" | "loggingOut" | "updatingProfile">) {
    return state.loggingIn || state.registering || state.loggingOut || state.updatingProfile;
}
