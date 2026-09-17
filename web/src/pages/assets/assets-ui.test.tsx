import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Asset } from "@/stores/use-asset-store";

// SSR fixtures only: never read or overwrite browser assets.
const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
const { default: AssetsPage } = await import("./index");
const { useAssetStore } = await import("@/stores/use-asset-store");
const { default: i18n } = await import("@/i18n");
if (storage) Object.defineProperty(globalThis, "localStorage", storage);
else Reflect.deleteProperty(globalThis, "localStorage");

test.each(["text", "image", "video"] as const)("%s asset actions are icon-only with accessible names", (kind) => {
    const state = useAssetStore.getInitialState();
    const previous = state.assets;
    const data = kind === "text" ? { content: "完整正文" } : { dataUrl: "", url: "", width: 800, height: 600, bytes: 100, mimeType: `${kind}/test` };
    try {
        state.assets = [{ id: "fixture", kind, title: "测试资产", coverUrl: "", tags: [], createdAt: "", updatedAt: "", data } as Asset];
        const html = renderToStaticMarkup(<AssetsPage />);
        const buttons = html.match(/<button\b[^>]*class="[^"]*library-card-action[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [];
        expect(html).toContain("items-center justify-end gap-2 px-3 pb-3");
        expect(buttons.at(-1)).toContain("library-card-action--danger");
        expect(buttons.at(-1)).not.toContain("ml-auto");
        const actions = ["view", ...(kind === "video" ? [] : ["edit"]), kind === "text" ? "copy" : "download", "delete"];
        expect(buttons).toHaveLength(actions.length);
        buttons.forEach((button, index) => {
            expect(button).toContain(`aria-label="${i18n.t(`common.${actions[index]}`)}"`);
            expect(button).toContain('aria-hidden="true"');
            expect(button.replace(/<[^>]*>/g, "").trim()).toBe("");
        });
    } finally {
        state.assets = previous;
    }
});

test("edit/view share the split layout; close dots retain equal insets and a large hit area", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source.match(/lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(280px,\.65fr\)\]/g)).toHaveLength(2);
    expect(source.indexOf('aria-label={t("assets.preview")}')).toBeLessThan(source.indexOf("<Form form={form}"));
    expect(source).not.toMatch(/form\.(getFieldValue|setFieldValue)\(/);
    const css = readFileSync(new URL("../../components/ui/overlay-controls.css", import.meta.url), "utf8");
    expect(css).toContain("top: 8px;");
    expect(css).toContain("right: 8px;");
    expect(css).toContain("width: 44px;");
    expect(css).toContain("width: 12px;");
    const motion = readFileSync(new URL("../../components/ui/card-actions.css", import.meta.url), "utf8");
    expect(motion).toMatch(/\.library-card-action--danger\s*\{\s*color: var\(--danger\);/);
    expect(motion).toContain("prefers-reduced-motion: reduce");
    expect(motion).toContain("(hover: hover) and (pointer: fine)");
});

test("resource libraries place search below the breadcrumb without an outer surface", () => {
    const assetsSource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    const promptsSource = readFileSync(new URL("../prompts/index.tsx", import.meta.url), "utf8");
    const studioCss = readFileSync(new URL("../../styles/studio.css", import.meta.url), "utf8");

    expect(assetsSource.indexOf("<StudioPageHeader")).toBeLessThan(assetsSource.indexOf('role="search"'));
    expect(promptsSource.indexOf("<StudioPageHeader")).toBeLessThan(promptsSource.indexOf('role="search"'));
    expect(assetsSource).not.toContain('Card className="studio-panel');
    expect(promptsSource).not.toContain('Card className="studio-panel');
    expect(assetsSource).not.toContain("rounded-lg border !gap-0");
    expect(promptsSource).not.toContain("rounded-lg border transition-colors");
    expect(studioCss).not.toMatch(/\.studio-page-header\s*\{[^}]*border-bottom/);
});
