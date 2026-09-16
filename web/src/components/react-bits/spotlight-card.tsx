// Adapted from React Bits SpotlightCard. See LICENSE.md in this directory.
import { useRef, type PropsWithChildren } from "react";
import { useReducedMotion } from "motion/react";

export function SpotlightCard({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
    const ref = useRef<HTMLDivElement>(null);
    const reducedMotion = useReducedMotion();

    return (
        <div
            ref={ref}
            onPointerMove={(event) => {
                if (reducedMotion || event.pointerType !== "mouse" || !ref.current) return;
                const rect = event.currentTarget.getBoundingClientRect();
                ref.current.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
                ref.current.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
            }}
            onFocus={() => {
                ref.current?.style.setProperty("--spot-x", "50%");
                ref.current?.style.setProperty("--spot-y", "50%");
            }}
            className={`group/spotlight relative isolate overflow-hidden rounded-lg ${className}`}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-200 group-focus-within/spotlight:opacity-100 [@media(hover:hover)]:group-hover/spotlight:opacity-100 motion-reduce:hidden"
                style={{ background: "radial-gradient(240px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--studio-accent, white) 18%, transparent), transparent 80%)" }}
            />
            {children}
        </div>
    );
}
