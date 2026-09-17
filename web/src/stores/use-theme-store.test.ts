import { expect, test } from "bun:test";

const storage = new Map<string, string>();
Object.assign(globalThis, {
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
});

const { useThemeStore } = await import("./use-theme-store");

test("system theme preference retains a concrete theme for canvas rendering", () => {
    const previous = useThemeStore.getState();
    try {
        useThemeStore.getState().setTheme("system");
        expect(useThemeStore.getState().preference).toBe("system");
        expect(["light", "dark"]).toContain(useThemeStore.getState().theme);
    } finally {
        useThemeStore.setState(previous, true);
    }
});
