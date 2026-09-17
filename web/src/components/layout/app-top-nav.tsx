import { Bot, Languages, Menu, Moon, Monitor, Sun } from "lucide-react";
import { Button, Tabs, Tooltip } from "@heroui/react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { GitHubLink } from "@/components/layout/github-link";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { PlatformAccount } from "@/components/layout/platform-account";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import TextType from "@/components/react-bits/TextType";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const HEADER_ICON_BUTTON_CLASS = "shrink-0 text-muted hover:text-foreground";

export function AppTopNav() {
    const { i18n, t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const themePreference = useThemeStore((state) => state.preference);
    const setTheme = useThemeStore((state) => state.setTheme);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const agentToggleLabel = t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent");
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });
    const brandName = t("topNav.brand");

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
                        <Link to="/" className="studio-nav-brand flex h-8 shrink-0 items-center gap-2 self-center text-sm font-semibold leading-none">
                            <span className="studio-nav-mark" aria-hidden="true">
                                <img src="/brand/visora-mark.png" alt="" className="size-full object-contain dark:invert" />
                            </span>
                            <span className="studio-nav-wordmark" aria-label={brandName}>
                                <span className="sr-only">{brandName}</span>
                                <TextType text={brandName} loop={false} />
                            </span>
                        </Link>
                        <span aria-hidden="true" className="ml-4 select-none text-lg font-light text-muted">/</span>

                        <Button variant="ghost" isIconOnly size="sm" className={cn("ml-2", !panelOpen && "xl:hidden")} onPress={() => setMobileNavOpen(true)} aria-label={t("topNav.openMenu")}>
                            <Menu className="size-5" />
                        </Button>

                        {/* null triggers automatic first-tab selection; an empty key keeps home unselected. */}
                        <Tabs selectedKey={activeToolSlug ?? ""} onSelectionChange={(key) => {
                            if (key !== activeToolSlug && navigationTools.some((tool) => tool.slug === key)) navigate(`/${key}`);
                        }} className={cn("ml-3 hidden h-8 min-w-0 !gap-0", !panelOpen && "xl:flex")}>
                            <Tabs.ListContainer className="!bg-transparent !p-0">
                                <Tabs.List aria-label={t("topNav.navigation")} className="h-8 !w-auto !min-w-0 !p-0">
                                    {navigationTools.map((tool) => (
                                        <Tabs.Tab key={tool.slug} id={tool.slug} className="h-8 w-auto rounded-md px-3 text-sm font-medium text-muted transition-colors hover:text-foreground data-[selected=true]:font-semibold data-[selected=true]:text-foreground">
                                            <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                            <Tabs.Indicator className="rounded-md !bg-surface shadow-xs" />
                                        </Tabs.Tab>
                                    ))}
                                </Tabs.List>
                            </Tabs.ListContainer>
                        </Tabs>
                    </div>

                    <div className="studio-nav-actions my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                        <Tooltip>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant="tertiary" size="sm" className={HEADER_ICON_BUTTON_CLASS} onPress={togglePanel} aria-label={agentToggleLabel}>
                                    <Bot className="size-4" />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement="bottom">{agentToggleLabel}</Tooltip.Content>
                        </Tooltip>
                        <UserStatusActions showAccount={false} showDocs={false} showTheme={false} showGitHub={false} showLocale={false} />
                        <PlatformAccount />
                        <GitHubLink />
                        <Tooltip delay={200}>
                            <Tooltip.Trigger>
                                <Button isIconOnly variant="tertiary" size="sm" className={HEADER_ICON_BUTTON_CLASS} onPress={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                                    <Languages className="size-4" />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement="bottom">{languageLabel}</Tooltip.Content>
                        </Tooltip>
                        <Tabs selectedKey={themePreference} onSelectionChange={(key) => setTheme(key as "light" | "dark" | "system")} className="h-8 shrink-0" data-theme-toggle>
                            <Tabs.ListContainer className="h-8 rounded-full border border-border !bg-default !p-0">
                                <Tabs.List aria-label="主题选择" className="h-full min-w-0 !p-0.5">
                                    <ThemeTab id="light" label="light"><Sun /></ThemeTab>
                                    <ThemeTab id="dark" label="dark"><Moon /></ThemeTab>
                                    <ThemeTab id="system" label="system"><Monitor /></ThemeTab>
                                </Tabs.List>
                            </Tabs.ListContainer>
                        </Tabs>
                    </div>
                </div>
            </header>

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}

function ThemeTab({ id, label, children }: { id: "light" | "dark" | "system"; label: "light" | "dark" | "system"; children: ReactNode }) {
    return (
        <Tabs.Tab id={id} aria-label={label} className="!size-6.5 justify-center rounded-full !p-1.5 text-muted transition-colors duration-100 hover:text-foreground data-[selected=true]:text-foreground">
            {children}
            <Tabs.Indicator className="rounded-full !bg-surface shadow-xs" />
        </Tabs.Tab>
    );
}
