import { expect, test } from "bun:test";

import { PlatformAuthError, fetchPlatformUser, loginPlatformUser, logoutPlatformUser, safeReturnTo } from "./platform-auth";

const user = {
    id: "user-1",
    email: "person@example.com",
    role: "user" as const,
    status: "active" as const,
    createdAt: "2026-09-14T00:00:00Z",
};

test("login uses the same-origin Cookie contract", async () => {
    let request: RequestInit | undefined;
    const result = await loginPlatformUser(
        { email: user.email, password: "secret" },
        {
            fetch: async (_input, init) => {
                request = init;
                return new Response(JSON.stringify({ user }), { headers: { "content-type": "application/json" } });
            },
        },
    );

    expect(result).toEqual(user);
    expect(request).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Visora-Request": "1" },
        body: JSON.stringify({ email: user.email, password: "secret" }),
    });
});

test("returns a safe API error for non-JSON failures", async () => {
    const result = fetchPlatformUser({
        fetch: async () => new Response("<html>upstream error</html>", { status: 503, headers: { "content-type": "text/html" } }),
    });

    await expect(result).rejects.toMatchObject({
        name: "PlatformAuthError",
        kind: "api",
        status: 503,
        message: "服务暂时不可用，请稍后重试。",
    } satisfies Partial<PlatformAuthError>);
});

test("keeps network interruptions distinct from API failures", async () => {
    const result = fetchPlatformUser({
        fetch: async () => {
            throw new TypeError("Failed to fetch");
        },
    });

    await expect(result).rejects.toMatchObject({
        name: "PlatformAuthError",
        kind: "network",
        message: "网络连接中断，请检查连接后重试。",
    } satisfies Partial<PlatformAuthError>);
});

test("logout sends the required JSON request marker", async () => {
    let request: RequestInit | undefined;
    await logoutPlatformUser({
        fetch: async (_input, init) => {
            request = init;
            return new Response(null, { status: 204 });
        },
    });

    expect(request).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Visora-Request": "1" },
        body: "{}",
    });
});

test("allows only same-site relative return paths", () => {
    expect(safeReturnTo("/canvas?view=board#top")).toBe("/canvas?view=board#top");
    expect(safeReturnTo("https://example.com")).toBe("/canvas");
    expect(safeReturnTo("//example.com")).toBe("/canvas");
    expect(safeReturnTo("/%2f%2fevil.example")).toBe("/canvas");
    expect(safeReturnTo("/\\evil.example")).toBe("/canvas");
});
