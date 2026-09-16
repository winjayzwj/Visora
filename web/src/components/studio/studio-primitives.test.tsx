import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Layers } from "lucide-react";
import { canvasThemes } from "../../lib/canvas-theme";
import { StudioEmptyState, StudioPageHeader } from "./studio-primitives";

test("page header preserves heading, metadata and existing actions", () => {
    const html = renderToStaticMarkup(<StudioPageHeader title="我的画布" icon={Layers} meta="2 个项目" actions={<button disabled>导出</button>} />);
    assert.ok(html.includes("<h1"));
    assert.ok(html.includes("我的画布"));
    assert.ok(html.includes("2 个项目"));
    assert.ok(html.includes('<button disabled="">导出</button>'));
});

test("empty state retains recovery action and hides decorative geometry", () => {
    const html = renderToStaticMarkup(
        <StudioEmptyState title="暂无项目" icon={Layers}>
            <button>新建画布</button>
        </StudioEmptyState>,
    );
    assert.ok(html.includes("暂无项目"));
    assert.ok(html.includes("<button>新建画布</button>"));
    assert.ok(html.includes('aria-hidden="true"'));
});

function luminance(hex: string) {
    const rgb = hex
        .match(/[a-f\d]{2}/gi)!
        .map((part) => parseInt(part, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

for (const mode of ["light", "dark"] as const) test(`${mode} canvas text retains AA contrast against node panels`, () => {
    const { node } = canvasThemes[mode];
    for (const text of [node.text, node.muted, node.placeholder, node.label]) {
        const pair = [luminance(text), luminance(node.panel)].sort((a, b) => b - a);
        assert.ok((pair[0] + 0.05) / (pair[1] + 0.05) >= 4.5);
    }
});
