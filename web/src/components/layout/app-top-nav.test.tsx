import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const values = new Map<string, string>();
Object.assign(globalThis, {
    __APP_VERSION__: "test",
    __APP_RELEASES__: [],
    localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});

test("keeps the global navigation visible while editing a canvas", async () => {
    const { AppTopNav } = await import("./app-top-nav");
    const markup = renderToStaticMarkup(
        <MemoryRouter initialEntries={["/canvas/project-1"]}>
            <AppTopNav />
        </MemoryRouter>,
    );

    expect(markup).toContain("studio-nav");
    expect((markup.match(/aria-label="(?:Switch to light theme|切换到浅色主题)"/g) ?? []).length).toBe(1);
});
