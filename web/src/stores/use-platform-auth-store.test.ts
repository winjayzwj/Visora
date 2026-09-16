import { expect, test } from "bun:test";

import { serve } from "bun";
import { fetchPlatformUser, loginPlatformUser, logoutPlatformUser, PlatformAuthError, type PlatformUser } from "../services/api/platform-auth";
import { createPlatformAuthStore } from "./use-platform-auth-store";

const firstUser: PlatformUser = {
    id: "user-1",
    email: "first@example.com",
    role: "user",
    status: "active",
    createdAt: "2026-09-14T00:00:00Z",
};

const secondUser: PlatformUser = { ...firstUser, id: "user-2", email: "second@example.com" };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test("a newer login cannot be overwritten by an earlier /me response", async () => {
    const currentUser = deferred<PlatformUser>();
    const store = createPlatformAuthStore({
        fetchPlatformUser: () => currentUser.promise,
        loginPlatformUser: async () => secondUser,
        logoutPlatformUser: async () => {},
    });

    const checking = store.getState().check();
    await store.getState().login(secondUser.email, "secret");
    currentUser.resolve(firstUser);
    await checking;

    expect(store.getState().user).toEqual(secondUser);
});

test("a newer auth action clears retired pending state", async () => {
    const currentUser = deferred<PlatformUser>();
    const store = createPlatformAuthStore({
        fetchPlatformUser: () => currentUser.promise,
        loginPlatformUser: async () => secondUser,
        logoutPlatformUser: async () => {},
    });

    void store.getState().check();
    await store.getState().login(secondUser.email, "secret");

    expect(store.getState().checking).toBe(false);
    expect(store.getState().loggingIn).toBe(false);
});

test("logout retains identity until confirmed and ignores a retired /me response", async () => {
    const currentUser = deferred<PlatformUser>();
    const logout = deferred<void>();
    const store = createPlatformAuthStore({
        fetchPlatformUser: () => currentUser.promise,
        loginPlatformUser: async () => firstUser,
        logoutPlatformUser: () => logout.promise,
    });

    await store.getState().login(firstUser.email, "secret");
    const checking = store.getState().check();
    const signingOut = store.getState().logout();
    expect(store.getState().user).toEqual(firstUser);

    currentUser.resolve(firstUser);
    await checking;
    expect(store.getState().user).toEqual(firstUser);
    expect(store.getState().loggingOut).toBe(true);

    logout.resolve();
    await signingOut;
    expect(store.getState().user).toBeNull();
    expect(store.getState().loggingOut).toBe(false);
});

test.each(["logout", "login"] as const)("delayed HTTP %s blocks both auth writes and /me dispatch until Cookie processing finishes", async (operation) => {
    const arrived = deferred<void>();
    const release = deferred<void>();
    const dispatched: string[] = [];
    const received: string[] = [];
    const completed: string[] = [];
    let delay = false;
    // Test-only Cookie jar. Production identity still uses the browser's HttpOnly Cookie.
    let cookie = "";
    const server = serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const path = new URL(request.url).pathname;
            received.push(path);
            if (delay && path === `/api/auth/${operation}`) {
                arrived.resolve();
                await release.promise;
            }
            if (path.endsWith("/logout")) return new Response(null, { status: 204, headers: { "Set-Cookie": "visora_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" } });
            return Response.json({ user: secondUser }, { headers: path.endsWith("/login") ? { "Set-Cookie": "visora_session=test-session; Path=/; HttpOnly; SameSite=Strict" } : {} });
        },
    });
    const options = {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input);
            dispatched.push(path);
            const headers = new Headers(init?.headers);
            if (cookie) headers.set("Cookie", cookie);
            const response = await fetch(new URL(path, server.url), { ...init, headers });
            const setCookie = response.headers.get("set-cookie");
            if (setCookie !== null) cookie = setCookie.split(";")[0];
            completed.push(path);
            return response;
        },
    };
    const store = createPlatformAuthStore({
        fetchPlatformUser: () => fetchPlatformUser(options),
        loginPlatformUser: (input) => loginPlatformUser(input, options),
        logoutPlatformUser: () => logoutPlatformUser(options),
    });
    let pending: Promise<unknown> | undefined;
    try {
        await store.getState().login(secondUser.email, "fixture");
        dispatched.length = received.length = completed.length = 0;
        delay = true;
        pending = operation === "logout" ? store.getState().logout() : store.getState().login(firstUser.email, "fixture");
        await arrived.promise;

        const immediateLogin = store
            .getState()
            .login(firstUser.email, "fixture")
            .then(
                () => null,
                (error) => error,
            );
        const immediateCheck = await store.getState().check();
        // Do not wait on a duplicate HTTP logout in the broken implementation.
        const immediateLogout = store
            .getState()
            .logout()
            .then(
                () => null,
                (error) => error,
            );
        expect(dispatched).toEqual([`/api/auth/${operation}`]);
        expect(await immediateLogin).toMatchObject({ code: "AUTH_BUSY" });
        expect(await immediateLogout).toMatchObject({ code: "AUTH_BUSY" });
        expect(immediateCheck).toBeNull();
        expect(store.getState()[operation === "logout" ? "loggingOut" : "loggingIn"]).toBe(true);
        expect(cookie).toBe("visora_session=test-session");
        expect(completed).toEqual([]);

        release.resolve();
        await pending;
        expect(store.getState().loggingIn).toBe(false);
        expect(store.getState().loggingOut).toBe(false);
        expect(cookie).toBe(operation === "logout" ? "visora_session=" : "visora_session=test-session");
        delay = false;
        await store.getState().login(secondUser.email, "fixture");
        expect(dispatched).toEqual([`/api/auth/${operation}`, "/api/auth/login"]);
        expect(received).toEqual(dispatched);
        expect(completed).toEqual(dispatched);
        expect(cookie).toBe("visora_session=test-session");
    } finally {
        release.resolve();
        await pending?.catch(() => undefined);
        await server.stop(true);
    }
});

test.each([200, 401, 503])("failed logout reconciles with /me %i while retaining the write lock and failure feedback", async (status) => {
    const calls: string[] = [];
    const reconciliation = deferred<void>();
    const logoutError = new PlatformAuthError("网络连接中断，请检查连接后重试。", "network");
    const store = createPlatformAuthStore({
        loginPlatformUser: async () => {
            calls.push("login");
            return firstUser;
        },
        logoutPlatformUser: async () => {
            calls.push("logout");
            throw logoutError;
        },
        fetchPlatformUser: async () => {
            calls.push("me");
            await reconciliation.promise;
            if (status !== 200) throw new PlatformAuthError(status === 401 ? "未登录" : "服务不可用", "api", status);
            return secondUser;
        },
    });
    await store.getState().login(firstUser.email, "fixture");
    const pending = store
        .getState()
        .logout()
        .then(
            () => null,
            (error) => error,
        );
    // The rejected logout promise schedules its reconciliation in this microtask.
    await Promise.resolve();
    try {
        expect(calls).toEqual(["login", "logout", "me"]);
        expect(store.getState()).toMatchObject({ loggingOut: true, checking: true, user: firstUser });
        await expect(store.getState().login(secondUser.email, "fixture")).rejects.toMatchObject({ code: "AUTH_BUSY" });
        await expect(store.getState().logout()).rejects.toMatchObject({ code: "AUTH_BUSY" });
        expect(await store.getState().check()).toBeNull();
        expect(calls).toEqual(["login", "logout", "me"]);
    } finally {
        reconciliation.resolve();
        await pending;
    }
    const result = await pending;
    expect(result).toMatchObject({ kind: "network" });
    expect(result.message).toContain("退出登录失败");
    expect(store.getState().error).toBe(result);
    expect(store.getState()).toMatchObject({ loggingOut: false, checking: false, loggingIn: false });
    expect(store.getState().user).toEqual(status === 200 ? secondUser : status === 401 ? null : firstUser);
    if (status === 503) expect(result.message).toContain("会话核对失败");
});

test("a late /me 401 cannot clear a newer successful login", async () => {
    const oldMe = deferred<void>();
    const store = createPlatformAuthStore({
        fetchPlatformUser: async () => {
            await oldMe.promise;
            throw new PlatformAuthError("未登录", "api", 401);
        },
        loginPlatformUser: async () => secondUser,
        logoutPlatformUser: async () => {},
    });
    const checking = store.getState().check();
    await store.getState().login(secondUser.email, "fixture");
    oldMe.resolve();
    expect(await checking).toBeNull();
    expect(store.getState().user).toEqual(secondUser);
});

test("a network failure remains retryable and does not become unauthenticated", async () => {
    let attempts = 0;
    const store = createPlatformAuthStore({
        fetchPlatformUser: async () => {
            attempts += 1;
            if (attempts === 1) throw new PlatformAuthError("网络连接中断，请检查连接后重试。", "network");
            return firstUser;
        },
        loginPlatformUser: async () => firstUser,
        logoutPlatformUser: async () => {},
    });

    await expect(store.getState().check()).rejects.toMatchObject({ kind: "network" });
    expect(store.getState().user).toBeNull();
    expect(store.getState().error).toMatchObject({ kind: "network" });

    await store.getState().check();
    expect(store.getState().user).toEqual(firstUser);
    expect(store.getState().error).toBeNull();
});
