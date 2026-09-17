import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("my-assets picker keeps the type filter beside its search field", () => {
    const source = readFileSync(new URL("./asset-picker-modal.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { Surface, Tabs } from "@heroui/react"');
    expect(source).toContain('role="search"');
    expect(source).toContain('aria-label={t("assets.type")}');
    expect(source).not.toContain("<aside");
    expect(source).not.toContain("sm:grid-cols-[190px_minmax(0,1fr)]");
});
