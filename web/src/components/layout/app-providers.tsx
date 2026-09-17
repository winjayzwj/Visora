import type { ReactNode } from "react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/components/ui/heroui-compat";
import { TooltipProvider } from "@/components/ui/tooltip";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useTranslation } from "react-i18next";

import { ClientRootInit } from "@/components/layout/client-root-init";
import type { AppLocale } from "@/i18n";
import { useThemeStore } from "@/stores/use-theme-store";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProviders({ children }: { children: ReactNode }) {
    const { i18n, t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const preference = useThemeStore((state) => state.preference);
    const setResolvedTheme = useThemeStore((state) => state.setResolvedTheme);
    const dark = theme === "dark";
    const locale = i18n.resolvedLanguage as AppLocale;

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        // HeroUI 默认主题同时认 `.dark` 与 `[data-theme="dark"]`，两个都写上。
        document.documentElement.setAttribute("data-theme", theme);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    useEffect(() => {
        if (preference !== "system") return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const sync = () => setResolvedTheme(media.matches ? "dark" : "light");
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, [preference, setResolvedTheme]);

    useEffect(() => {
        document.documentElement.lang = locale;
        document.title = t("meta.title");
        document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
        dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
    }, [locale, t]);

    return (
        <TooltipProvider delayDuration={450} skipDelayDuration={250}>
            <App>
                <QueryClientProvider client={queryClient}>
                    <ClientRootInit>{children}</ClientRootInit>
                </QueryClientProvider>
            </App>
        </TooltipProvider>
    );
}
