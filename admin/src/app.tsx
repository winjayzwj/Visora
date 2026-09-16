import { Alert, Button, ConfigProvider, Spin, Typography } from "./components/ui/heroui-compat";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "./components/admin-shell";
import type { ThemeMode } from "./lib/theme";
import { resolveWebOrigin } from "./lib/web-origin";
import { createRequestGate } from "./lib/request-gate";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { MembershipPage } from "./pages/membership";
import { ModelsPage } from "./pages/models";
import { PointsPage } from "./pages/points";
import { SystemPage } from "./pages/system";
import { TeamsPage } from "./pages/teams";
import { UsersPage } from "./pages/users";
import { api, ApiError, isAbortError, type Credentials, type User } from "./services/api/platform";

type AuthState =
    | { kind: "checking" }
    | { kind: "anonymous" }
    | { kind: "ready"; user: User }
    | { kind: "error"; message: string };

type Notice = { type: "success" | "error"; message: string };

function getSystemDark() {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function useSystemDark() {
    const [dark, setDark] = useState(getSystemDark);

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const update = () => setDark(media.matches);

        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return dark;
}

function errorText(error: unknown, fallback: string) {
    return error instanceof ApiError && error.status === 503 ? "服务暂不可用，请稍后重试。" : fallback;
}

function AccessDeniedView({
    logoutPending,
    notice,
    onDismissNotice,
    onLogout,
    webOrigin,
}: {
    logoutPending: boolean;
    notice?: Notice;
    onDismissNotice: () => void;
    onLogout: () => void;
    webOrigin: string | null;
}) {
    return (
        <main className="status-page">
            <section className="status-panel" aria-labelledby="access-title">
                <Typography.Title id="access-title" level={1}>
                    你没有管理权限
                </Typography.Title>
                <Typography.Paragraph>此账号不能查看用户列表。你可以退出当前账号后重新登录。</Typography.Paragraph>
                {notice ? (
                    <Alert
                        action={
                            notice.type === "error" ? (
                                <Button disabled={logoutPending} size="small" onClick={onLogout}>
                                    重试退出
                                </Button>
                            ) : null
                        }
                        className="status-alert"
                        closable
                        message={notice.message}
                        showIcon
                        type={notice.type}
                        onClose={onDismissNotice}
                    />
                ) : null}
                {webOrigin ? (
                    <div className="status-actions">
                        <Button icon={<ArrowLeft aria-hidden="true" size={16} />} onClick={() => window.location.assign(webOrigin)}>
                            返回创作台
                        </Button>
                    </div>
                ) : (
                    <Typography.Paragraph className="return-unavailable">创作台地址未配置，暂不能跳转。</Typography.Paragraph>
                )}
            </section>
        </main>
    );
}

function SessionErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <main className="status-page">
            <section className="status-panel" aria-labelledby="session-title">
                <Typography.Title id="session-title" level={1}>
                    暂时无法确认身份
                </Typography.Title>
                <Typography.Paragraph>{message}</Typography.Paragraph>
                <Button icon={<RefreshCw aria-hidden="true" size={16} />} type="primary" onClick={onRetry}>
                    重试
                </Button>
            </section>
        </main>
    );
}

export function AdminApp() {
    const systemDark = useSystemDark();
    const [themeMode, setThemeMode] = useState<ThemeMode>("system");
    const dark = themeMode === "system" ? systemDark : themeMode === "dark";
    const webOrigin = useMemo(
        () => resolveWebOrigin(import.meta.env.VITE_WEB_ORIGIN, window.location.origin, import.meta.env.DEV),
        [],
    );

    // 抽屉与弹层渲染在 portal 中，主题变量必须挂在根元素上才能被它们读到。
    useEffect(() => {
        document.documentElement.dataset.theme = dark ? "dark" : "light";
    }, [dark]);

    const authGate = useRef(createRequestGate());
    const authController = useRef<AbortController>();

    const [auth, setAuth] = useState<AuthState>({ kind: "checking" });
    const [sessionToken, setSessionToken] = useState(0);
    const [loginPending, setLoginPending] = useState(false);
    const [logoutPending, setLogoutPending] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [notice, setNotice] = useState<Notice>();

    const clearSession = useCallback(() => {
        authGate.current.invalidate();
        authController.current?.abort();
        setAuth({ kind: "anonymous" });
        setAccessDenied(false);
        setSessionToken((token) => token + 1);
    }, []);

    // 必须保持稳定引用：用户管理页把它放进 loadUsers 的依赖里，
    // 每次渲染新建函数会让列表请求反复重跑。
    const markForbidden = useCallback(() => setAccessDenied(true), []);

    const checkSession = useCallback(async () => {
        authController.current?.abort();
        const controller = new AbortController();
        const ticket = authGate.current.issue();
        authController.current = controller;
        setAuth({ kind: "checking" });

        try {
            const result = await api.getMe(controller.signal);
            if (authGate.current.isCurrent(ticket)) {
                setAuth({ kind: "ready", user: result.user });
                setSessionToken((token) => token + 1);
            }
        } catch (error) {
            if (isAbortError(error) || !authGate.current.isCurrent(ticket)) {
                return;
            }
            if (error instanceof ApiError && error.status === 401) {
                setAuth({ kind: "anonymous" });
                return;
            }

            setAuth({ kind: "error", message: errorText(error, "身份服务未响应，请重试。") });
        }
    }, []);

    useEffect(() => {
        void checkSession();

        return () => {
            authGate.current.invalidate();
            authController.current?.abort();
        };
    }, [checkSession]);

    const handleLogin = useCallback(async (values: Credentials) => {
        authController.current?.abort();
        const ticket = authGate.current.issue();
        setLoginPending(true);

        try {
            const result = await api.login(values);
            if (authGate.current.isCurrent(ticket)) {
                setAccessDenied(false);
                setAuth({ kind: "ready", user: result.user });
                setSessionToken((token) => token + 1);
            }
        } catch (error) {
            if (authGate.current.isCurrent(ticket)) {
                setAuth({ kind: "anonymous" });
            }
            throw error;
        } finally {
            if (authGate.current.isCurrent(ticket)) {
                setLoginPending(false);
            }
        }
    }, []);

    const handleLogout = useCallback(async () => {
        authController.current?.abort();
        const ticket = authGate.current.issue();
        setLogoutPending(true);

        try {
            await api.logout();
            if (authGate.current.isCurrent(ticket)) {
                setAuth({ kind: "anonymous" });
                setAccessDenied(false);
                setSessionToken((token) => token + 1);
            }
        } catch (error) {
            if (!authGate.current.isCurrent(ticket)) {
                return;
            }
            if (error instanceof ApiError && error.status === 401) {
                clearSession();
                return;
            }
            setNotice({ type: "error", message: `退出未完成：${errorText(error, "请求未完成，请稍后重试。")}` });
        } finally {
            if (authGate.current.isCurrent(ticket)) {
                setLogoutPending(false);
            }
        }
    }, [clearSession]);

    let content: React.ReactNode;

    if (auth.kind === "checking") {
        content = (
            <main className="loading-page" aria-live="polite">
                <Spin size="small" />
                <span>正在确认身份</span>
            </main>
        );
    } else if (auth.kind === "error") {
        content = <SessionErrorView message={auth.message} onRetry={checkSession} />;
    } else if (auth.kind === "anonymous") {
        content = (
            <LoginPage mode={themeMode} onLogin={handleLogin} onModeChange={setThemeMode} pending={loginPending} webOrigin={webOrigin} />
        );
    } else if (auth.user.role !== "admin" || accessDenied) {
        content = (
            <AccessDeniedView
                logoutPending={logoutPending}
                notice={notice}
                onDismissNotice={() => setNotice(undefined)}
                onLogout={handleLogout}
                webOrigin={webOrigin}
            />
        );
    } else {
        content = (
            <AdminShell
                logoutPending={logoutPending}
                mode={themeMode}
                user={auth.user}
                onLogout={() => void handleLogout()}
                onModeChange={setThemeMode}
            >
                <Routes>
                    <Route
                        path="/dashboard"
                        element={
                            <DashboardPage
                                sessionToken={sessionToken}
                                user={auth.user}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/users"
                        element={
                            <UsersPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/teams"
                        element={
                            <TeamsPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/membership"
                        element={
                            <MembershipPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/models"
                        element={
                            <ModelsPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/points"
                        element={
                            <PointsPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route
                        path="/system"
                        element={
                            <SystemPage
                                sessionToken={sessionToken}
                                onForbidden={markForbidden}
                                onUnauthorized={clearSession}
                            />
                        }
                    />
                    <Route path="*" element={<Navigate replace to="/dashboard" />} />
                </Routes>
            </AdminShell>
        );
    }

    return (
        <ConfigProvider>
            <div className="admin-shell" data-theme={dark ? "dark" : "light"}>
                {content}
            </div>
        </ConfigProvider>
    );
}
