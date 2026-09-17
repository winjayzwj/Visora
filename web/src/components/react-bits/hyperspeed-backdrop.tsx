// Inspired by React Bits Hyperspeed: a theme-aware, low-overhead Canvas 2D backdrop.
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type HyperspeedBackdropProps = {
    className?: string;
    density?: "calm" | "full";
};

type Trail = { lane: number; depth: number; speed: number; width: number; accent: boolean };

type Palette = { accent: string; foreground: string; muted: string; dark: boolean };

const trailCount = { calm: 24, full: 44 } as const;

function createTrail(): Trail {
    return {
        lane: Math.random() * 2 - 1,
        depth: Math.random(),
        speed: 0.18 + Math.random() * 0.32,
        width: 0.45 + Math.random() * 1.2,
        accent: Math.random() > 0.67,
    };
}

function resolveColor(value: string, fallback: string) {
    const probe = document.createElement("span");
    probe.style.color = value || fallback;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color || fallback;
    probe.remove();
    return color;
}

function readPalette(): Palette {
    const styles = getComputedStyle(document.documentElement);
    return {
        accent: resolveColor(styles.getPropertyValue("--accent").trim(), "#3b82f6"),
        foreground: resolveColor(styles.getPropertyValue("--foreground").trim(), "#111827"),
        muted: resolveColor(styles.getPropertyValue("--muted").trim(), "#6b7280"),
        dark: document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark",
    };
}

export function HyperspeedBackdrop({ className, density = "full" }: HyperspeedBackdropProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) return;

        const trails = Array.from({ length: trailCount[density] }, createTrail);
        const state = { width: 1, height: 1, dpr: 1, palette: readPalette(), lastTime: performance.now(), frame: 0 };

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            state.width = Math.max(1, rect.width);
            state.height = Math.max(1, rect.height);
            state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = Math.round(state.width * state.dpr);
            canvas.height = Math.round(state.height * state.dpr);
            context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        };

        const draw = (elapsed: number) => {
            const { width, height, palette } = state;
            const horizon = height * 0.44;
            const baseAlpha = palette.dark ? 0.55 : 0.24;
            const side = width * 0.78;

            context.clearRect(0, 0, width, height);
            context.save();
            context.globalCompositeOperation = "lighter";

            context.lineCap = "round";
            context.lineWidth = 1;
            context.strokeStyle = palette.muted;
            context.globalAlpha = baseAlpha * 0.24;
            for (let line = -3; line <= 3; line++) {
                const x = width / 2 + line * width * 0.09;
                context.beginPath();
                context.moveTo(width / 2, horizon);
                context.lineTo(x, height * 1.04);
                context.stroke();
            }

            context.strokeStyle = palette.foreground;
            context.globalAlpha = baseAlpha * 0.16;
            context.beginPath();
            context.moveTo(width * 0.08, height * 1.02);
            context.lineTo(width / 2, horizon);
            context.lineTo(width * 0.92, height * 1.02);
            context.stroke();

            for (const trail of trails) {
                const end = Math.min(1.08, trail.depth);
                const start = Math.max(0.018, end - 0.105 - end * 0.075);
                const endEase = end * end;
                const startEase = start * start;
                const xEnd = width / 2 + trail.lane * side * endEase;
                const xStart = width / 2 + trail.lane * side * startEase;
                const yEnd = horizon + endEase * height * 0.68;
                const yStart = horizon + startEase * height * 0.68;
                const isAccent = trail.accent;

                context.beginPath();
                context.moveTo(xStart, yStart);
                context.lineTo(xEnd, yEnd);
                context.strokeStyle = isAccent ? palette.accent : palette.foreground;
                context.globalAlpha = baseAlpha * Math.min(0.95, 0.25 + end * 0.8);
                context.lineWidth = trail.width * (0.55 + end * 1.2);
                context.stroke();
            }

            context.restore();

            if (elapsed <= 0) return;
            for (const trail of trails) {
                trail.depth += trail.speed * elapsed;
                if (trail.depth > 1.08) Object.assign(trail, createTrail(), { depth: 0.012 + Math.random() * 0.08 });
            }
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        const themeObserver = new MutationObserver(() => {
            state.palette = readPalette();
            draw(0);
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
        resize();
        draw(0);

        if (reducedMotion) {
            return () => {
                resizeObserver.disconnect();
                themeObserver.disconnect();
            };
        }

        const tick = (time: number) => {
            const delta = Math.min((time - state.lastTime) / 1000, 0.05);
            state.lastTime = time;
            draw(document.visibilityState === "visible" ? delta : 0);
            state.frame = requestAnimationFrame(tick);
        };
        state.frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(state.frame);
            resizeObserver.disconnect();
            themeObserver.disconnect();
        };
    }, [density, reducedMotion]);

    return (
        <div className={cn("hyperspeed-backdrop", className)} aria-hidden="true">
            <canvas ref={canvasRef} />
        </div>
    );
}
