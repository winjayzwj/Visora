import { Button, Drawer, Dropdown } from "./ui/heroui-compat";
import { ChevronDown, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ThemeMode } from "../lib/theme";
import { ADMIN_ROUTES, ADMIN_SECTIONS, findRoute } from "../routes";
import type { User } from "../services/api/platform";

const NARROW = "(max-width: 900px)";

function useNarrow() {
    const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

    useEffect(() => {
        const media = window.matchMedia(NARROW);
        const update = () => setNarrow(media.matches);

        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return narrow;
}

function ThemeSwitcher({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
    const items = [
        { mode: "light" as const, label: "浅色模式", icon: Sun },
        { mode: "dark" as const, label: "深色模式", icon: Moon },
        { mode: "system" as const, label: "跟随系统", icon: Monitor },
    ];

    return (
        <div aria-label="主题模式" className="theme-switcher" role="group">
            {items.map(({ mode: value, label, icon: Icon }) => (
                <Button
                    aria-label={label}
                    className="theme-switcher-button"
                    data-selected={mode === value}
                    isIconOnly
                    key={value}
                    size="sm"
                    variant={mode === value ? "secondary" : "tertiary"}
                    aria-pressed={mode === value}
                    onPress={() => onModeChange(value)}
                >
                    <Icon aria-hidden="true" size={15} />
                </Button>
            ))}
        </div>
    );
}

function Navigation({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
    const reducedMotion = useReducedMotion();
    const location = useLocation();

    return (
        <>
            {ADMIN_SECTIONS.map((group) => {
                const routes = ADMIN_ROUTES.filter((route) => route.section === group);

                if (routes.length === 0) {
                    return null;
                }

                return (
                    <div className="shell-nav-group" key={group}>
                        {collapsed ? null : <div className="shell-nav-label">{group}</div>}
                        <nav aria-label={group}>
                            {routes.map(({ path, title, icon: Icon }) => {
                                const active = findRoute(location.pathname)?.path === path;

                                return (
                                    <NavLink
                                        className="shell-nav-item"
                                        data-active={active}
                                        key={path}
                                        title={title}
                                        to={path}
                                        onClick={onNavigate}
                                    >
                                        {active ? (
                                            <motion.span
                                                aria-hidden="true"
                                                className="shell-nav-ink"
                                                layoutId="shell-nav-ink"
                                                transition={
                                                    reducedMotion
                                                        ? { duration: 0 }
                                                        : { type: "spring", stiffness: 480, damping: 38 }
                                                }
                                            />
                                        ) : null}
                                        <Icon aria-hidden="true" size={16} />
                                        {collapsed ? null : <span>{title}</span>}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>
                );
            })}
        </>
    );
}

export function AdminShell({
    children,
    logoutPending,
    mode,
    onLogout,
    onModeChange,
    user,
}: PropsWithChildren<{
    logoutPending: boolean;
    mode: ThemeMode;
    onLogout: () => void;
    onModeChange: (mode: ThemeMode) => void;
    user: User;
}>) {
    const [collapsed, setCollapsed] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const narrow = useNarrow();
    const location = useLocation();
    const route = findRoute(location.pathname);

    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

    const brand = (
        <div className="shell-brand">
            <span aria-hidden="true" className="shell-brand-mark">
                V
            </span>
            {collapsed && !narrow ? null : (
                <span className="shell-brand-copy">
                    <strong>Visora</strong>
                    <small>管理后台</small>
                </span>
            )}
        </div>
    );

    const aside = (
        <>
            {brand}
            <Navigation collapsed={collapsed && !narrow} onNavigate={narrow ? () => setDrawerOpen(false) : undefined} />
            <div className="shell-nav-foot">
                {collapsed && !narrow ? null : <span title={user.email}>{user.email}</span>}
            </div>
        </>
    );

    return (
        <div className="shell" data-collapsed={collapsed && !narrow}>
            <a className="skip-link" href="#admin-main">
                跳到主内容
            </a>

            {narrow ? (
                <Drawer
                    closable={false}
                    open={drawerOpen}
                    placement="left"
                    styles={{ body: { padding: 0, background: "var(--island)" } }}
                    width="min(84vw, 268px)"
                    onClose={() => setDrawerOpen(false)}
                >
                    <div className="shell-aside shell-aside-drawer">{aside}</div>
                </Drawer>
            ) : (
                <aside className="shell-aside">{aside}</aside>
            )}

            <div className="shell-main">
                <header className="shell-header">
                    <div className="shell-header-context">
                        <Button
                            aria-label={narrow ? "打开导航" : collapsed ? "展开导航" : "收起导航"}
                            className="shell-icon-button"
                            onClick={() => (narrow ? setDrawerOpen(true) : setCollapsed(!collapsed))}
                            isIconOnly
                            variant="tertiary"
                        >
                            {narrow ? (
                                <Menu size={16} aria-hidden="true" />
                            ) : collapsed ? (
                                <PanelLeftOpen size={16} aria-hidden="true" />
                            ) : (
                                <PanelLeftClose size={16} aria-hidden="true" />
                            )}
                        </Button>
                        <span className="shell-crumb">
                            <span>{route?.section ?? "平台"}</span>
                            <i aria-hidden="true">/</i>
                            <strong>{route?.title ?? "管理后台"}</strong>
                        </span>
                    </div>

                    <div className="shell-header-actions">
                        <ThemeSwitcher mode={mode} onModeChange={onModeChange} />
                        <Dropdown
                            menu={{
                                items: [
                                    {
                                        key: "logout",
                                        icon: <LogOut size={14} aria-hidden="true" />,
                                        label: "退出登录",
                                        disabled: logoutPending,
                                        onClick: onLogout,
                                    },
                                ],
                            }}
                            placement="bottomRight"
                            trigger={["click"]}
                        >
                            <Button aria-label="打开账户菜单" className="shell-account" variant="tertiary">
                                <UserRound size={15} aria-hidden="true" />
                                <span className="shell-account-copy">
                                    <strong>{user.role === "admin" ? "管理员" : "普通用户"}</strong>
                                    <small>{user.email}</small>
                                </span>
                                <ChevronDown size={14} aria-hidden="true" />
                            </Button>
                        </Dropdown>
                    </div>
                </header>

                <main className="shell-content" id="admin-main" tabIndex={-1}>
                    {children}
                </main>
            </div>
        </div>
    );
}
