import { Bot, Menu } from "lucide-react";
import { Button, Tooltip } from "@heroui/react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const agentToggleLabel = t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent");
    const themeToggleLabel = t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme");

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    return (
        <>
            <header className="studio-nav sticky top-0 z-20 h-16 shrink-0">
                <div className="mx-auto flex h-full max-w-[1600px] items-stretch justify-between gap-2 px-4 sm:gap-5 sm:px-8">
                    <div className="flex min-w-0 items-center">
                        <Link to="/" className="studio-nav-brand flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none">
                            <img src="/logo.svg" alt="" aria-hidden="true" className="size-7 shrink-0" />
                            <span className="text-base font-medium">{t("meta.title")}</span>
                        </Link>

                        <Button variant="ghost" isIconOnly size="sm" className={cn("ml-2", !panelOpen && "xl:hidden")} onPress={() => setMobileNavOpen(true)} aria-label={t("topNav.openMenu")}>
                            <Menu className="size-5" />
                        </Button>

                        <nav aria-label={t("topNav.navigation")} className={cn("ml-9 hidden h-16 min-w-0 items-center gap-6", !panelOpen && "xl:flex")}>
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link key={tool.slug} to={`/${tool.slug}`} aria-current={active ? "page" : undefined} className={cn("studio-nav-link", active && "font-semibold")}>
                                        <Icon className="size-4" />
                                        <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button variant="ghost" isIconOnly size="sm" onPress={togglePanel} aria-label={agentToggleLabel}>
                                    <Bot className="size-4" />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement="bottom">{agentToggleLabel}</Tooltip.Content>
                        </Tooltip>
                        <Tooltip delay={200}>
                            <Tooltip.Trigger>
                                <AnimatedThemeToggler
                                    theme={theme}
                                    onThemeChange={setTheme}
                                    className="inline-flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&_svg]:size-4"
                                    aria-label={themeToggleLabel}
                                />
                            </Tooltip.Trigger>
                            <Tooltip.Content placement="bottom">{themeToggleLabel}</Tooltip.Content>
                        </Tooltip>
                        <UserStatusActions showTheme={false} />
                    </div>
                </div>
            </header>

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
