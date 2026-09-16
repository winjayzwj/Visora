import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { PlatformAccount } from "../../components/layout/platform-account";
import { PlatformAuthError } from "../../services/api/platform-auth";
import { usePlatformAuthStore } from "../../stores/use-platform-auth-store";
import LoginPage from "./index";

test("login heading is visible above the login and registration tabs", () => {
    const { login } = renderAuth({});
    expect(login).toContain('id="login-title"');
    expect(login.indexOf('id="login-title"')).toBeLessThan(login.indexOf('aria-current="page"'));
    expect(login).toContain("登录创作台</h1>");
});

test("third-party login uses full-width Google and Apple provider buttons", () => {
    const { login } = renderAuth({});
    expect(login).toContain("使用 Google 登录");
    expect(login).toContain("使用 Apple 登录");
    expect(login).toContain("第三方登录方式");
    expect(login).toContain(">OR<");
    expect(login).toContain("aria-disabled=\"true\"");
    expect(login).not.toContain("微信登录（暂未开放）");
    expect(login).not.toContain("GitHub登录（暂未开放）");
});

test("login uses HeroUI tabs, a form submit button, and outlined social buttons", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain('<Tabs className="mb-6 w-full"');
    expect(source).toContain('<Form\n                                className="space-y-5"');
    expect(source).toContain('<Button type="submit" fullWidth variant="primary"');
    expect(source).not.toContain("SpecularButton");
    expect(source.match(/fullWidth isDisabled variant="outline" size="md" className="w-full font-mono text-xs"/g)).toHaveLength(2);
    expect(source).toContain('<Button className="w-full font-mono text-xs" variant="outline" size="md"');
    expect(source).not.toContain("creation-login-social-button");
    expect(source).not.toContain('title="切换深色或浅色"');
});

test("login form is wrapped in a HeroUI Card and provider buttons stay compact", () => {
    const { login } = renderAuth({});
    expect(login).toContain("creation-login-card");
    const css = readFileSync(new URL("../../styles/studio.css", import.meta.url), "utf8");
    expect(css).toContain(".creation-login-card");
    expect(css).not.toContain(".creation-login-social-button");
});

test("the complete login shell uses a HeroUI Card instead of Surface", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain('<Card variant="default" className="relative z-10 w-full max-w-[1120px] overflow-hidden !gap-0 !p-0">');
    expect(source).toContain('<Card.Content className="grid !gap-0 !p-0');
    expect(source).not.toContain("creation-shell");
    expect(source).not.toContain("Surface,");
});

test("the login brand panel uses a Card code visual and a creation-flow signal", () => {
    const brand = readFileSync(new URL("./brand-panel.tsx", import.meta.url), "utf8");
    const visual = readFileSync(new URL("../../components/studio/creation-system-visual.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../styles/studio.css", import.meta.url), "utf8");
    expect(brand).toContain("creation-login-signal");
    expect(brand).toContain("BRIEF");
    expect(brand).toContain("FRAME");
    expect(brand).toContain("MOTION");
    expect(visual).toContain('<Card variant="default" className={`creation-system-visual !gap-0 !p-0');
    expect(visual).toContain("<Card.Content");
    expect(css).toContain(".creation-login-signal");
});

test("home renders the brand loop with a static poster fallback", async () => {
    const { default: HomePage } = await import("../home");
    const home = renderToStaticMarkup(
        <MemoryRouter>
            <HomePage />
        </MemoryRouter>,
    );
    expect(home).toContain('poster="/media/visora-home-loop-poster.jpg"');
    expect(home).toContain('src="/media/visora-home-loop.mp4"');
    expect(home).toContain("home.start");
});

function renderAuth(patch: Partial<ReturnType<typeof usePlatformAuthStore.getState>>) {
    // React SSR reads Zustand's initial snapshot. Seed only that in-memory fixture and restore it.
    const initial = usePlatformAuthStore.getInitialState();
    const previous = { ...initial };
    try {
        Object.assign(initial, patch);
        return {
            login: renderToStaticMarkup(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>,
            ),
            account: renderToStaticMarkup(
                <MemoryRouter>
                    <PlatformAccount />
                </MemoryRouter>,
            ),
        };
    } finally {
        Object.assign(initial, previous);
    }
}

test.each([
    { loggingIn: true, loggingOut: false, checking: false, label: "正在登录" },
    { loggingIn: false, loggingOut: true, checking: false, label: "正在退出登录" },
    { loggingIn: false, loggingOut: true, checking: true, label: "正在核对退出结果" },
])("both account and login controls show and disable for $label", ({ label, ...state }) => {
    const { login, account } = renderAuth(state);
    expect(login.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
    for (const id of ["email", "password"]) {
        expect(login.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0]).toContain('disabled=""');
    }
    expect(account.match(/<button\b[^>]*>/)?.[0]).toContain('disabled=""');
    expect(login).toContain(label);
    expect(account).toContain(label);
});

test("login page displays the shared logout failure after reconciliation", () => {
    const error = new PlatformAuthError("退出登录失败：网络连接中断。已核对当前无有效会话。", "network");
    const { login } = renderAuth({ error, user: null });
    expect(login).toContain(error.message);
    expect(login.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).not.toContain('disabled=""');
});
