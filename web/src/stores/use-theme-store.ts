import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";
export type ThemePreference = ThemeName | "system";

type ThemeStore = {
    theme: ThemeName;
    preference: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    setResolvedTheme: (theme: ThemeName) => void;
};

const systemTheme = (): ThemeName => (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            preference: "dark",
            setTheme: (preference) => set({ preference, theme: preference === "system" ? systemTheme() : preference }),
            setResolvedTheme: (theme) => set({ theme }),
        }),
        { name: "visora:theme_store" },
    ),
);
