import type { CSSProperties } from "react";
import { Button, Tooltip } from "@heroui/react";
import { BookOpen, Keyboard, Languages, Puzzle, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { PlatformAccount } from "@/components/layout/platform-account";
import { DOCS_URL } from "@/constant/env";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
    showAccount?: boolean;
    showConfig?: boolean;
    showDocs?: boolean;
    showTheme?: boolean;
    showGitHub?: boolean;
    showLocale?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showAccount = true, showConfig = true, showDocs = true, showTheme = true, showGitHub = true, showLocale = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { i18n, t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = variant === "default" ? "studio-nav-utility-action" : "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label={t("topNav.plugins")} title={t("topNav.plugins")}>
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            {showAccount ? <PlatformAccount variant={variant} /> : null}
            {showDocs && DOCS_URL ? (
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label={t("topNav.docs")} title={t("topNav.docs")}>
                    <BookOpen className="size-4" />
                </a>
            ) : null}
            {showConfig ? (
                <Button isIconOnly variant="tertiary" size="sm" className={variant === "default" ? "shrink-0 text-muted hover:text-foreground" : naturalIconClass} style={iconStyle} onPress={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                    <Settings2 className="size-4" />
                </Button>
            ) : null}
            {showLocale ? (
                <Tooltip delay={200}>
                    <Tooltip.Trigger>
                        <Button isIconOnly variant="tertiary" size="sm" className={variant === "default" ? "shrink-0 text-muted hover:text-foreground" : naturalIconClass} style={iconStyle} onPress={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                            <Languages className="size-4" />
                        </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="bottom">{languageLabel}</Tooltip.Content>
                </Tooltip>
            ) : null}
            {showTheme ? <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} /> : null}
            {showGitHub ? <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} /> : null}
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")} title={t("topNav.shortcuts")}>
                    <Keyboard className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
