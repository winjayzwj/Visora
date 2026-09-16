import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.VISORA_WEB_URL || "http://127.0.0.1:8890";
for (const path of ["/", "/login", "/assets", "/assets/", "/canvas", "/image", "/video", "/prompts", "/config", "/admin/"]) {
    test(`Docker serves app entry at ${path}`, async () => {
        const response = await fetch(new URL(path, base));
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes('id="root"'));
    });
}

test("Docker API is ready and anonymous identity remains protected", async () => {
    const ready = await fetch(new URL("/readyz", base));
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, "ready");
    assert.equal((await fetch(new URL("/api/auth/me", base))).status, 401);
});
