import { useEffect, useRef, type PropsWithChildren } from "react";
import { useReducedMotion } from "motion/react";

const BRUSH_RADIUS = 88;

function paperColor(element: HTMLElement) {
    return getComputedStyle(element).getPropertyValue("--paper").trim() || "#fcfaf8";
}

export function InkMask({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (reducedMotion || !host || !canvas) {
            return;
        }

        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }

        let previous: { x: number; y: number } | null = null;

        const cover = () => {
            const rect = host.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return;
            }

            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * ratio);
            canvas.height = Math.round(rect.height * ratio);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.globalCompositeOperation = "source-over";
            context.fillStyle = paperColor(host);
            context.fillRect(0, 0, rect.width, rect.height);
        };

        const brush = (x: number, y: number) => {
            const gradient = context.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
            gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
            gradient.addColorStop(0.55, "rgba(0, 0, 0, 0.72)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            context.globalCompositeOperation = "destination-out";
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
            context.fill();
        };

        const erase = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
                return;
            }

            const rect = host.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            if (previous) {
                const distance = Math.hypot(x - previous.x, y - previous.y);
                const steps = Math.max(1, Math.ceil(distance / (BRUSH_RADIUS / 2.5)));
                for (let step = 1; step <= steps; step += 1) {
                    brush(previous.x + ((x - previous.x) * step) / steps, previous.y + ((y - previous.y) * step) / steps);
                }
            } else {
                brush(x, y);
            }

            previous = { x, y };
        };

        const forget = () => {
            previous = null;
        };

        cover();
        host.addEventListener("pointermove", erase);
        host.addEventListener("pointerleave", forget);
        host.addEventListener("pointerdown", erase);

        const observer = new ResizeObserver(cover);
        observer.observe(host);

        return () => {
            host.removeEventListener("pointermove", erase);
            host.removeEventListener("pointerleave", forget);
            host.removeEventListener("pointerdown", erase);
            observer.disconnect();
        };
    }, [reducedMotion]);

    return (
        <div ref={hostRef} className={`relative overflow-hidden ${className}`}>
            {children}
            {reducedMotion ? null : (
                <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 block" />
            )}
        </div>
    );
}
