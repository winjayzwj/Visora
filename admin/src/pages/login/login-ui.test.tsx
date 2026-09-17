import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "./index";

test("admin login follows the web login shell while keeping administrator-only login", () => {
    const html = renderToStaticMarkup(<LoginPage mode="light" onModeChange={() => {}} pending={false} onLogin={async () => {}} />);
    expect(html).toContain("auth-aside");
    expect(html).toContain("VISORA ADMIN");
    expect(html).toContain("账号登录");
    expect(html).not.toContain("返回创作台");
    expect(html).not.toContain("第三方登录");
    expect(html).toContain("登录管理后台");
    expect(html).toContain("邮箱 / Email");
    expect(html).toContain("密码 / Password");
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
});

test("pending login disables credential fields and submit", () => {
    const html = renderToStaticMarkup(<LoginPage mode="dark" onModeChange={() => {}} pending onLogin={async () => {}} />);
    expect(html).toContain("正在登录");
    const inputs = html.match(/<input\b[^>]*>/g) || [];
    expect(inputs).toHaveLength(2);
    inputs.forEach((input) => expect(input).toContain("disabled"));
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-pending="true"/);
});
