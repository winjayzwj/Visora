import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { PlatformAccount } from "../../components/layout/platform-account";
import { PlatformAuthError } from "../../services/api/platform-auth";
import { usePlatformAuthStore } from "../../stores/use-platform-auth-store";
import LoginPage from "./index";

const testStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => testStorage.get(key) ?? null,
        setItem: (key: string, value: string) => testStorage.set(key, value),
        removeItem: (key: string) => testStorage.delete(key),
    },
});
await import("../../i18n");

test("login heading is visible above the login and registration tabs", () => {
    const { login } = renderAuth({});
    expect(login).toContain('id="login-title"');
    expect(login.indexOf('id="login-title"')).toBeLessThan(login.indexOf('aria-label="登录或注册"'));
    expect(login).toContain("回到正在做的事</h1>");
});

test("third-party login keeps labelled disabled Google and Apple controls", () => {
    const { login } = renderAuth({});
    expect(login).toContain("使用 Google 登录");
    expect(login).toContain("使用 Apple 登录");
    expect(login).toContain("第三方登录方式");
    expect(login).toContain(">或<");
    expect(login).toContain('data-disabled="true"');
    expect(login).not.toContain("微信登录（暂未开放）");
    expect(login).not.toContain("GitHub登录（暂未开放）");
});

test("login uses HeroUI tabs, a form submit button, and outlined social buttons", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain('className="w-full"');
    expect(source).toContain("selectedKey={activeTab}");
    expect(source).toMatch(/<Form\s+className="space-y-4"/);
    expect(source).toContain('<Button type="submit" fullWidth variant="primary"');
    expect(source).not.toContain("SpecularButton");
    expect(source.match(/fullWidth isDisabled variant="outline" size="md" className="h-10 w-full text-sm"/g)).toHaveLength(2);
    expect(source).toContain('<Button className="mt-5 h-10 w-full text-[13px]" variant="ghost"');
    expect(source).not.toContain("creation-login-social-button");
    expect(source).not.toContain('title="切换深色或浅色"');
    expect(source).toContain("changeAppLocale(nextLocale)");
    expect(source).toContain('<Languages className="size-4" aria-hidden="true" />');
});

test("email registration is an active tab rather than a disabled placeholder", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain('const [activeTab, setActiveTab] = useState<"login" | "register">("login")');
    expect(source).toContain("const register = usePlatformAuthStore((state) => state.register);");
    expect(source).toMatch(/<Tabs\.Tab className="flex-1" id="register">/);
    expect(source).not.toContain('<Tabs.Tab className="flex-1" id="register" isDisabled>');
});

test("account control opens a HeroUI profile drawer with a skeleton state", () => {
    const source = readFileSync(new URL("../../components/layout/platform-account-drawer.tsx", import.meta.url), "utf8");
    expect(source).toContain("<Drawer.Backdrop");
    expect(source).toContain('<Drawer.Content placement="right">');
    expect(source).toContain('<Drawer.Dialog className="w-[min(100vw,440px)] max-w-full">');
    expect(source).toContain("<Skeleton");
    expect(source).toContain("updateProfile");
    expect(source).toContain("第三方绑定");
});

test("login form avoids nested borders and keeps a local canvas entry", () => {
    const { login } = renderAuth({});
    expect(login).toContain("免登录使用本地画布");
    const css = readFileSync(new URL("../../styles/studio.css", import.meta.url), "utf8");
    expect(css).not.toContain(".creation-login-card");
    expect(css).not.toContain(".creation-login-social-button");
});

test("the complete login shell uses a HeroUI Card instead of Surface", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toContain('<Card variant="default" className="creation-login-shell relative z-10 w-full max-w-[1040px] overflow-hidden !gap-0 !p-0">');
    expect(source).toContain('<Card.Content className="grid !gap-0 !p-0');
    expect(source).not.toContain("creation-shell");
    expect(source).not.toContain("Surface,");
});

test("the login brand panel pairs the sign-in flow with an accessible creative artwork", () => {
    const { login } = renderAuth({});
    expect(login).toContain("从一张图开始，也能走得更远。");
    expect(login).toContain("/brand/creative/ribbon-story.webp");
    expect(login).toContain("映序创作工具");
    expect(login).toContain("图像</span>");
    expect(login).toContain("视频</span>");
    expect(login).toContain("画布</span>");
    expect(login).not.toContain("creation-system-visual");
    expect(login).not.toContain("canvas.compose");
});

test("home uses a single animated headline and real studio imagery", () => {
    const home = readFileSync(new URL("../home/index.tsx", import.meta.url), "utf8");
    const brand = readFileSync(new URL("./brand-panel.tsx", import.meta.url), "utf8");
    const gradient = readFileSync(new URL("../../components/react-bits/GradientText.tsx", import.meta.url), "utf8");

    expect(home).toContain('import { useGSAP } from "@gsap/react";');
    expect(home).toContain('import GradientText from "@/components/react-bits/GradientText";');
    expect(home).toContain("/brand/creative/studio-beam.webp");
    expect(home).toContain("HyperspeedBackdrop");
    expect(home).toContain("/brand/creative/ribbon-story.webp");
    expect(home).toContain("data-home-reveal");
    expect(home).toContain("min-h-[1.18em] max-w-full leading-[1.08]");
    expect(home).toContain("key={i18n.resolvedLanguage}");
    expect(home).toContain('className="creation-home-rotating-text block w-full max-w-full leading-[1.08]"');
    expect(brand).toContain("/brand/creative/ribbon-story.webp");
    expect(brand).not.toContain("CreationSystemVisual");
    expect(gradient).toContain('colors = ["var(--foreground)", "var(--accent)", "color-mix(in srgb, var(--foreground) 68%, var(--accent))"]');
});

test("third-party login controls stay below the tabs for both credential modes", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('{activeTab === "login" ? (');
    expect(source.indexOf('aria-label={t("login.thirdParty")}')).toBeGreaterThan(source.indexOf("</Tabs>"));
});

test("home renders an actionable creative path with local artwork", async () => {
    const { default: HomePage } = await import("../home");
    const home = renderToStaticMarkup(
        <MemoryRouter>
            <HomePage />
        </MemoryRouter>,
    );
    expect(home).toContain('src="/brand/creative/studio-beam.webp"');
    expect(home).toContain('src="/brand/creative/ribbon-story.webp"');
    expect(home).toContain("开始创作");
    expect(home).toContain("先把画面定下来");
    expect(home).toContain("把线索摊开看");
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
    { registering: true, loggingIn: false, loggingOut: false, checking: false, label: "正在创建账户" },
    { loggingIn: false, loggingOut: true, checking: false, label: "正在退出登录" },
    { loggingIn: false, loggingOut: true, checking: true, label: "正在核对退出结果" },
])("both account and login controls show and disable for $label", ({ label, ...state }) => {
    const { login, account } = renderAuth(state);
    expect(login).toContain('data-disabled="true"');
    expect(account).toContain('data-disabled="true"');
    expect(login).toContain(label);
    expect(account).toContain(label);
});

test("login page keeps session-probe failures out of the credential form", () => {
    const error = new PlatformAuthError("退出登录失败：网络连接中断。已核对当前无有效会话。", "network");
    const { login } = renderAuth({ error, user: null });
    expect(login).not.toContain(error.message);
    expect(login.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).not.toContain('disabled=""');
});
