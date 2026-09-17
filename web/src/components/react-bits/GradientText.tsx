// React Bits GradientText; copyright and license in LICENSE.md.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";

type GradientTextProps = {
    children: ReactNode;
    className?: string;
    colors?: string[];
    animationSpeed?: number;
    direction?: "horizontal" | "vertical" | "diagonal";
    pauseOnHover?: boolean;
};

export default function GradientText({
    children,
    className = "",
    colors = ["var(--foreground)", "var(--accent)", "color-mix(in srgb, var(--foreground) 68%, var(--accent))"],
    animationSpeed = 8,
    direction = "horizontal",
    pauseOnHover = false,
}: GradientTextProps) {
    const [isPaused, setIsPaused] = useState(false);
    const reducedMotion = useReducedMotion();
    const progress = useMotionValue(0);
    const elapsedRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null);
    const duration = animationSpeed * 1000;
    const axis = direction === "vertical" ? "vertical" : "horizontal";
    const position = useTransform(progress, (value) => (axis === "horizontal" ? `${value}% 50%` : `50% ${value}%`));

    useAnimationFrame((time) => {
        if (isPaused || reducedMotion) {
            lastTimeRef.current = null;
            return;
        }
        if (lastTimeRef.current === null) {
            lastTimeRef.current = time;
            return;
        }
        elapsedRef.current += time - lastTimeRef.current;
        lastTimeRef.current = time;
        progress.set((elapsedRef.current / duration) * 100);
    });

    useEffect(() => {
        elapsedRef.current = 0;
        progress.set(0);
    }, [animationSpeed, progress]);

    const gradient = `linear-gradient(${direction === "vertical" ? "to bottom" : direction === "diagonal" ? "to bottom right" : "to right"}, ${[...colors, colors[0]].join(", ")})`;

    const pause = useCallback(() => pauseOnHover && setIsPaused(true), [pauseOnHover]);
    const resume = useCallback(() => pauseOnHover && setIsPaused(false), [pauseOnHover]);

    return (
        <motion.span
            className={`inline-block bg-clip-text text-transparent ${className}`}
            style={{ backgroundImage: gradient, backgroundPosition: position, backgroundRepeat: "repeat", backgroundSize: axis === "horizontal" ? "300% 100%" : "100% 300%", WebkitBackgroundClip: "text" }}
            onMouseEnter={pause}
            onMouseLeave={resume}
        >
            {children}
        </motion.span>
    );
}
