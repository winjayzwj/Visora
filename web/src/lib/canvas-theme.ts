export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2f6f6",
            dot: "rgba(43,77,80,.22)",
            line: "rgba(43,77,80,.10)",
            selectionStroke: "#006c65",
            selectionFill: "rgba(0,108,101,.08)",
        },
        node: {
            label: "#52666a",
            fill: "#e4eded",
            panel: "#ffffff",
            stroke: "#cad8da",
            activeStroke: "#006c65",
            placeholder: "#64787b",
            text: "#162427",
            muted: "#52666a",
            faint: "#64787b",
        },
        toolbar: {
            panel: "rgba(255,255,255,.96)",
            border: "#cad8da",
            item: "#52666a",
            itemHover: "#e4eded",
            activeBg: "#d9efe8",
            activeText: "#005b53",
        },
    },
    dark: {
        canvas: {
            background: "#0c1012",
            dot: "rgba(160,196,198,.20)",
            line: "rgba(160,196,198,.09)",
            selectionStroke: "#8af0db",
            selectionFill: "rgba(138,240,219,.09)",
        },
        node: {
            label: "#c6dadd",
            fill: "#1f272b",
            panel: "#141a1d",
            stroke: "#35454b",
            activeStroke: "#8af0db",
            placeholder: "#8b9fa2",
            text: "#edf4f4",
            muted: "#b2c6c9",
            faint: "#8b9fa2",
        },
        toolbar: {
            panel: "rgba(20,26,29,.96)",
            border: "#35454b",
            item: "#c6dadd",
            itemHover: "#1f272b",
            activeBg: "#193d35",
            activeText: "#a4f6df",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
